import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const server = require("next/server");

export const NextResponse = server.NextResponse;
export const NextRequest = server.NextRequest;
