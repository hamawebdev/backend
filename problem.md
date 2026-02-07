2026-02-07T16:02:36.022Z > med-adn-backend@1.0.0 start:prod
2026-02-07T16:02:36.022Z > node build/app.js
2026-02-07T16:02:36.376Z Server is running on http://0.0.0.0:8080
2026-02-07T16:03:11.359Z Login error: PrismaClientInitializationError:
2026-02-07T16:03:11.359Z Invalid `prisma.user.findUnique()` invocation:
2026-02-07T16:03:11.359Z error: Error validating datasource `db`: the URL must start with the protocol `file:`.
2026-02-07T16:03:11.359Z -->  schema.prisma:7
2026-02-07T16:03:11.359Z |
2026-02-07T16:03:11.359Z 6 |   provider = "sqlite"
2026-02-07T16:03:11.359Z 7 |   url      = env("DATABASE_URL")
2026-02-07T16:03:11.359Z |
2026-02-07T16:03:11.359Z Validation Error Count: 1
2026-02-07T16:03:11.359Z at ei.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7568)
2026-02-07T16:03:11.359Z at ei.handleAndLogRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:6593)
2026-02-07T16:03:11.359Z at ei.request (/app/node_modules/@prisma/client/runtime/library.js:121:6300)
2026-02-07T16:03:11.359Z at async a (/app/node_modules/@prisma/client/runtime/library.js:130:9551) {
2026-02-07T16:03:11.359Z clientVersion: '6.19.2',
2026-02-07T16:03:11.359Z errorCode: undefined,
2026-02-07T16:03:11.359Z retryable: undefined
2026-02-07T16:03:11.359Z }
2026-02-07T16:03:11.360Z Error occurred: InternalServerError: We're experiencing technical difficulties. Please try again later.
2026-02-07T16:03:11.360Z at AuthService.<anonymous> (/app/build/modules/auth/auth.service.js:115:23)
2026-02-07T16:03:11.360Z at Generator.throw (<anonymous>)
2026-02-07T16:03:11.360Z at rejected (/app/build/modules/auth/auth.service.js:18:65) {
2026-02-07T16:03:11.360Z statusCode: 500,
2026-02-07T16:03:11.360Z details: undefined,
2026-02-07T16:03:11.360Z isOperational: true,
2026-02-07T16:03:11.360Z code: undefined
2026-02-07T16:03:11.360Z }
2026-02-07T16:03:11.364Z [0mPOST /api/v1/auth/login [31m500[0m 15.243 ms - 211[0m
2026-02-07T16:03:19.316Z Login error: PrismaClientInitializationError:
2026-02-07T16:03:19.316Z Invalid `prisma.user.findUnique()` invocation:
2026-02-07T16:03:19.316Z error: Error validating datasource `db`: the URL must start with the protocol `file:`.
2026-02-07T16:03:19.316Z -->  schema.prisma:7
2026-02-07T16:03:19.316Z |
2026-02-07T16:03:19.316Z 6 |   provider = "sqlite"
2026-02-07T16:03:19.316Z 7 |   url      = env("DATABASE_URL")
2026-02-07T16:03:19.316Z |
2026-02-07T16:03:19.316Z Validation Error Count: 1
2026-02-07T16:03:19.316Z at ei.handleRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:7568)
2026-02-07T16:03:19.316Z at ei.handleAndLogRequestError (/app/node_modules/@prisma/client/runtime/library.js:121:6593)
2026-02-07T16:03:19.316Z at ei.request (/app/node_modules/@prisma/client/runtime/library.js:121:6300)
2026-02-07T16:03:19.316Z at async a (/app/node_modules/@prisma/client/runtime/library.js:130:9551) {
2026-02-07T16:03:19.316Z clientVersion: '6.19.2',
2026-02-07T16:03:19.316Z errorCode: undefined,
2026-02-07T16:03:19.316Z retryable: undefined
2026-02-07T16:03:19.316Z }
2026-02-07T16:03:19.316Z Error occurred: InternalServerError: We're experiencing technical difficulties. Please try again later.
2026-02-07T16:03:19.316Z at AuthService.<anonymous> (/app/build/modules/auth/auth.service.js:115:23)
2026-02-07T16:03:19.316Z at Generator.throw (<anonymous>)
2026-02-07T16:03:19.316Z at rejected (/app/build/modules/auth/auth.service.js:18:65) {
2026-02-07T16:03:19.316Z statusCode: 500,
2026-02-07T16:03:19.316Z details: undefined,
2026-02-07T16:03:19.316Z isOperational: true,
2026-02-07T16:03:19.316Z code: undefined
2026-02-07T16:03:19.316Z }
2026-02-07T16:03:19.317Z [0mPOST /api/v1/auth/login [31m500[0m 4.578 ms - 210[0m