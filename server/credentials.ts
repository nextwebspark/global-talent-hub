import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Vertex needs a credentials FILE. On Railway we get the JSON via env var,
// so materialize it to /tmp and point ADC at it before any GenAI client builds.
const json = process.env.GOOGLE_VERTEX_KEY_JSON;
if (json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const keyPath = join(tmpdir(), "vertex-key.json");
  writeFileSync(keyPath, json, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}
