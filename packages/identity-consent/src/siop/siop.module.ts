import { BullModule } from "@nestjs/bull";
import { Module } from "@nestjs/common";
import SiopController from "./siop.controller";
import SiopProcessor from "./siop.processor";
import { REDIS_URL, REDIS_PORT } from "../config";

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: "siop",
        redis: {
          host: REDIS_URL,
          port: REDIS_PORT,
        },
      },
      {
        name: "siopError",
        redis: {
          host: REDIS_URL,
          port: REDIS_PORT,
        },
      }
    ),
  ],
  controllers: [SiopController],
  providers: [SiopProcessor],
})
export default class SiopModule {}
