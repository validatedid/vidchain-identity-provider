import axios from "axios";
import { BadRequestException, Logger } from "@nestjs/common";
import { DidAuthTypes, OidcClaimRequest, OidcSsi } from "@validatedid/did-auth";
import jwt_decode from "jwt-decode";
import { JWTPayload } from "@validatedid/did-auth/dist/interfaces/JWT";
import { SESSIONS, grantType, Entity, scope } from "../config";
import ERRORS from "./error";
import {
  IEnterpriseAuthZToken,
  AccessTokenResponseBody,
} from "../@types/Tokens";

// TODO: When type OidcClaim is export it by the library used it.
function getVcFromScope(inputScope: string): OidcClaimRequest {
  const scopeArray: string[] = inputScope.split(",");
  const claim: OidcClaimRequest = {};
  scopeArray.forEach((value) => {
    // Skip the first two scopes. Ex: offline openid VerifiableIdCredential
    if (value !== "openid" && value !== "offline") {
      const oidcClaim: OidcSsi.OidcClaimJson = {
        essential: true,
      };
      claim[value] = oidcClaim;
    }
  });
  return claim;
}

async function doPostCall(data: unknown, url: string): Promise<unknown> {
  const logger = new Logger("Util: doPostCall");
  try {
    logger.log(`Calling url: ${url}`);
    const response = await axios.post(url, data);
    logger.log("AXIOS RESPONSE: ");
    logger.log(response.data);
    return response.data as unknown;
  } catch (error) {
    logger.log((error as Error).message, url);
    logger.log((error as Error).name);
    logger.log((error as Error).stack);
    throw error;
  }
}

async function getAuthToken(): Promise<string> {
  const url = SESSIONS;
  const logger = new Logger("Util: AuthToken");
  logger.debug(JSON.stringify(Entity, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(Entity, null, 2));
  const data = {
    grantType,
    assertion: Buffer.from(JSON.stringify(Entity)).toString("base64"),
    scope,
  };
  try {
    const response = await axios.post(url, data);
    if (
      !response ||
      !response.data ||
      !(response.data as AccessTokenResponseBody).accessToken
    )
      throw new BadRequestException(ERRORS.SESSION);

    return (response.data as AccessTokenResponseBody).accessToken;
  } catch (error) {
    logger.error(
      `POST AUTH TOKEN ERROR: ${(error as Error).message} : ${
        (error as Error).name
      }`
    );
    // eslint-disable-next-line no-console
    console.error(
      `POST AUTH TOKEN ERROR: ${(error as Error).message} : ${
        (error as Error).name
      }`
    );
    throw error;
  }
}

function getEnterpriseDID(token: string): string {
  const payload = jwt_decode(token);
  return (payload as IEnterpriseAuthZToken).did;
}

function getJwtNonce(jwt: string): string {
  const payload = jwt_decode(jwt);
  return (payload as IEnterpriseAuthZToken).nonce;
}

function parseUserDid(did: string): string {
  return did.split("#")[0];
}

function getUserDid(jwt: string): string {
  const payload = jwt_decode(jwt);
  const didWithSufix = (payload as DidAuthTypes.DidAuthResponsePayload).sub_jwk
    .kid;
  if (!didWithSufix) throw new BadRequestException(ERRORS.NO_KID_FOUND);
  return parseUserDid(didWithSufix);
}

function isTokenExpired(jwt: string): boolean {
  if (jwt === null || jwt === "") return true;
  const payload = jwt_decode(jwt);
  if (!payload) return true;
  const { exp } = payload as JWTPayload;
  if (!exp) return true;
  return +exp * 1000 < Date.now();
}

export {
  doPostCall,
  getUserDid,
  getJwtNonce,
  isTokenExpired,
  getAuthToken,
  getVcFromScope,
  getEnterpriseDID,
};
