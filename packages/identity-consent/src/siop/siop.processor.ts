import { Process, Processor, InjectQueue, OnQueueCompleted } from '@nestjs/bull';
import { Logger, BadRequestException, Body } from '@nestjs/common';
import { Job, Queue } from 'bull'
import { VidDidAuth, DidAuthRequestCall, DIDAUTH_ERRORS} from '../did-auth/src/index';
import { SiopUriRequest, SiopResponse, SiopAckRequest, QRResponse, SiopResponseJwt, DidAuthValidationResponse, LoginResponse } from './dtos/SIOP';
import { doPostCall, getAuthToken, getUserDid, getJwtNonce } from 'src/util/Util';
import { BASE_URL, SIGNATURES, SIGNATURE_VALIDATION, REDIS_PORT, REDIS_URL } from '../config';
import QRCode from 'qrcode';
import io from 'socket.io-client';
import Redis from 'ioredis';

@Processor('siop')
export class SiopProcessor {
  constructor(@InjectQueue('siopError') private readonly siopErrorQueue: Queue) {}

  private readonly logger = new Logger(SiopProcessor.name);
  private readonly nonceRedis = new Redis({ 
    port: REDIS_PORT,
    host: REDIS_URL,
    keyPrefix: "nonce:" 
  });
  private readonly jwtRedis = new Redis({  
    port: REDIS_PORT,
    host: REDIS_URL, 
    keyPrefix: "jwt:" });
  private readonly socket = io(BASE_URL);

  @Process('userRequest')
  async handleSiopRequest(job: Job): Promise<string> {
    this.logger.debug('SIOP Request received.')
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`)
    this.logger.debug("Processing job")
    if (!job || !job.data || !job.data.clientId || !job.data.sessionId) {
      console.log(DIDAUTH_ERRORS.BAD_PARAMS);
      throw new BadRequestException(DIDAUTH_ERRORS.BAD_PARAMS)
    }
    const authZToken = await getAuthToken();
    const didAuthRequestCall: DidAuthRequestCall = {
      redirectUri: BASE_URL + "/siop/responses",
      signatureUri: SIGNATURES,
      authZToken: authZToken
    };
    console.log(didAuthRequestCall);
    // Creates a URI using the wallet backend that manages entity DID keys
    const { uri, nonce, jwt } = await VidDidAuth.createUriRequest(didAuthRequestCall);
    this.logger.debug(`SIOP Request JWT: ${jwt}`)
    // store siopRequestJwt with the user session id
    this.jwtRedis.set(job.data.sessionId, jwt)
    this.logger.debug(`SIOP Request URI: ${uri}`)
    // store sessionId and nonce 
    this.nonceRedis.set(job.data.sessionId, nonce)
    this.logger.debug('SIOP Request completed.')

    return uri
  }

  @OnQueueCompleted()
  async onCompleted(job: Job, result: string) {
    this.logger.debug('SIOP Request event completed.')
    this.logger.debug(`Processing result`)
    this.logger.debug('Result: ' + JSON.stringify(result))
    if (!job || !job.data || !result) {
      throw new BadRequestException(DIDAUTH_ERRORS.BAD_PARAMS)
    }

    // when clientUriRedirect NOT present, print QR to be read from an APP
    // !!! TODO: implement a way to send the siop:// and be catched by client (web plugin or APP deep link)
    if (!job.data.clientUriRedirect) {
      // generate QR code image 
      const imageQr = await QRCode.toDataURL(result)
      const qrResponse:QRResponse = {
        imageQr, 
        siopUri: result
      }
      // sends an event to the server, to send the QR to the client
      this.socket.emit('sendSIOPRequestJwtToFrontend', qrResponse);
    }

    // when clientUriRedirect is present, we post the SIOP URI to the user server
    if (job.data.clientUriRedirect) {
      const response:SiopAckRequest = await doPostCall(result, job.data.clientUriRedirect)
      this.logger.debug('Response: ' + JSON.stringify(response))
      // sends error to Front-end
      if (!response || !response.validationRequest) {
        this.logger.debug('Error on SIOP Request Validation.')
        await this.siopErrorQueue.add('errorSiopRequestValidation');
      }
    }
  }


}