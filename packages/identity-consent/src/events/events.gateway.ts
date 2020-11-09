import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayInit,
    OnGatewayDisconnect,
    WsResponse,
    MessageBody,
    ConnectedSocket,
  } from '@nestjs/websockets';
  import { Socket, Server } from 'socket.io';
  import { Logger, BadRequestException } from '@nestjs/common';
  import { SiopResponse, QRResponse, SiopUriRedirect, MessageSendSignInResponse, MessageSendQRResponse} from 'src/siop/dtos/SIOP';
  import { Observable, of } from 'rxjs';
  import { InjectQueue } from '@nestjs/bull';
  import { Queue } from 'bull';
  import { CLIENT_ID_URI } from '../config';
  
  @WebSocketGateway({cookie: false})
  export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    
    @WebSocketServer() wss: Server;
    constructor(@InjectQueue('siop') private readonly siopQueue: Queue) {}
    private logger: Logger = new Logger('EventsGateway');
  
    afterInit() {
      this.logger.log('Initialized!')
    }
  
    handleConnection(client: Socket) {
      this.logger.log(`Client connected:     ${client.id}`)
    }
  
    handleDisconnect(client: Socket) {
      this.logger.log(`Client disconnected:     ${client.id}`)
    }
    
    @SubscribeMessage('signIn')
    handleSignInEvent(
      @MessageBody() uriRedirect:SiopUriRedirect,
      @ConnectedSocket() client: Socket ): Observable<WsResponse<unknown>> {
        this.logger.debug(`SignIn Received from ${client.id}`);
        this.logger.debug(`SignIn Received from ${uriRedirect.client_name}`);
        this.logger.debug(`SignIn Received from ${uriRedirect.scope}`);
        if (uriRedirect && uriRedirect.clientUriRedirect) {
          this.logger.debug(`Using URI redirect: ${uriRedirect.clientUriRedirect}`)
        }
        // queueing the request
        this.siopQueue.add('userRequest', { 
          clientId: CLIENT_ID_URI,
          clientName: uriRedirect.client_name,
          sessionId: client.id,
          clientUriRedirect: uriRedirect && uriRedirect.clientUriRedirect ? uriRedirect.clientUriRedirect : undefined
        });
        this.logger.debug(`Sin the queue ${client.id}`);
  
        return of({event: 'signIn', data: `SignIn request received and queued for:  ${client.id}`})
    }
    
    @SubscribeMessage('sendSIOPRequestJwtToFrontend')
    handlePrintQREvent(@MessageBody() qrResponse: MessageSendQRResponse): void {
      this.logger.log(`SIOP Request SIOP URI:    ${qrResponse.qRResponse.siopUri}`)
      const clientId = qrResponse.clientId;
      this.wss.to(clientId).emit('printQR', qrResponse.qRResponse);
    }
  
    @SubscribeMessage('sendSignInResponse')
    handleSignInResponseEvent(@MessageBody() message: MessageSendSignInResponse): void {
      this.logger.log(`SIOP Response Validation:     ${JSON.stringify(message.siopResponse)}`)
      const clientId = message.clientId;
      this.wss.to(clientId).emit('signInResponse', JSON.stringify(message.siopResponse));
    }
  }