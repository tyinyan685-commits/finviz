import { presets } from "./_lib/presets.js";

export default function handler(_request, response) {
  response.status(200).json({ presets });
}
