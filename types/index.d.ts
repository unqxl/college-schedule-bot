export {};

declare global {
  declare namespace NodeJS {
    interface ProcessEnv {
      BOT_TOKEN: string;
      SCHEDULE_URL: string;
    }
  }
}
