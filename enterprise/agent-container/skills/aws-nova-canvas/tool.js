#!/usr/bin/env node
/**
 * aws-nova-canvas — Generate images via Amazon Bedrock Nova Canvas.
 *
 * Input (JSON string as argv[2]):
 *   { "prompt": "...", "outputPath": "/tmp/image.png", "width": 1024, "height": 1024,
 *     "negativePrompt": "...", "quality": "standard|premium" }
 *
 * Output (JSON to stdout):
 *   { imagePath, prompt, width, height, sizeBytes, model }
 */

'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = { prompt: process.argv[2] }; }

const prompt = args.prompt;
if (!prompt) {
  console.log(JSON.stringify({ error: 'prompt is required', usage: '{"prompt":"A serene mountain lake at sunset","width":1024,"height":1024}' }));
  process.exit(1);
}

const width      = args.width   || 1024;
const height     = args.height  || 1024;
const quality    = args.quality || 'standard';
const region     = process.env.AWS_REGION || 'us-east-1';
const workspace  = process.env.OPENCLAW_WORKSPACE || '/root/.openclaw/workspace';
const outputDir  = path.join(workspace, 'output');
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = args.outputPath || path.join(outputDir, `nova-canvas-${Date.now()}.png`);

const payload = {
  taskType: 'TEXT_IMAGE',
  textToImageParams: {
    text: prompt,
    ...(args.negativePrompt ? { negativeText: args.negativePrompt } : {}),
  },
  imageGenerationConfig: {
    numberOfImages: 1,
    width,
    height,
    quality,
    cfgScale: 8.0,
  },
};

const tmpPayload  = path.join(os.tmpdir(), `nova-canvas-in-${Date.now()}.json`);
const tmpResponse = path.join(os.tmpdir(), `nova-canvas-out-${Date.now()}.json`);

fs.writeFileSync(tmpPayload, JSON.stringify(payload));

try {
  execSync(
    `aws bedrock-runtime invoke-model` +
    ` --model-id "amazon.nova-canvas-v1:0"` +
    ` --body "fileb://${tmpPayload}"` +
    ` --content-type "application/json"` +
    ` --accept "application/json"` +
    ` --region "${region}"` +
    ` "${tmpResponse}"`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  const response  = JSON.parse(fs.readFileSync(tmpResponse, 'utf8'));
  const imageData = response.images?.[0];
  if (!imageData) throw new Error('No image returned by Nova Canvas');

  const imageBuffer = Buffer.from(imageData, 'base64');
  fs.writeFileSync(outputPath, imageBuffer);

  console.log(JSON.stringify({
    imagePath:  outputPath,
    prompt,
    width,
    height,
    quality,
    sizeBytes:  imageBuffer.length,
    model:      'amazon.nova-canvas-v1:0',
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
} finally {
  try { fs.unlinkSync(tmpPayload);  } catch {}
  try { fs.unlinkSync(tmpResponse); } catch {}
}
