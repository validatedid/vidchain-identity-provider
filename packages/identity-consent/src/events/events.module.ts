import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import EventsGateway from "./events.gateway";
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
  providers: [EventsGateway],
})
export default class EventsModule {}
