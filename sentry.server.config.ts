import * as Sentry from "@sentry/nextjs"

console.log("[Sentry] server init", {
  dsn: process.env.SENTRY_DSN ? "set" : "missing",
  dsnLen: process.env.SENTRY_DSN?.length ?? 0,
  env: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production",
})

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
  debug: true,
  beforeSend(event) {
    console.log("[Sentry] beforeSend", {
      event_id: event.event_id,
      message: event.message,
      exception: event.exception?.values?.[0]?.value,
    })
    return event
  },
})
