import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { logger } from "../utils/logger.js";

const OPENCODE_RELEASES = "https://api.github.com/repos/anomalyco/opencode/releases/latest";

export interface OpenCodeInstallResult {
  binaryPath: string;
  version: string;
  cached: boolean;
}

export async function setupOpenCode(version?: string): Promise<OpenCodeInstallResult> {
  const cacheDir = resolve(process.env.HOME || homedir(), ".codesentinel", "opencode");
  mkdirSync(cacheDir, { recursive: true });

  const targetVersion = version ?? "latest";
  const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode";
  const binaryPath = join(cacheDir, `${targetVersion}-${binaryName}`);

  if (existsSync(binaryPath)) {
    logger.info(`OpenCode: using cached binary at ${binaryPath}`);
    return { binaryPath, version: targetVersion, cached: true };
  }

  logger.info(`OpenCode: downloading ${targetVersion}...`);
  try {
    const releaseInfo = await fetchReleaseInfo(targetVersion);
    const asset = findAsset(releaseInfo, binaryName);
    if (!asset) throw new Error(`No binary asset found for ${binaryName}`);

    const buffer = await downloadBinary(asset.url);
    await verifyChecksum(buffer, releaseInfo, asset.name);

    writeFileSync(binaryPath, buffer, { mode: 0o755 });
    logger.info(`OpenCode: installed at ${binaryPath}`);
    return { binaryPath, version: releaseInfo.tag_name, cached: false };
  } catch (err) {
    logger.warn(`OpenCode: download failed (${err}), checking system path...`);
    const systemPath = checkSystemPath(binaryName);
    if (systemPath) {
      logger.info(`OpenCode: using system binary at ${systemPath}`);
      return { binaryPath: systemPath, version: "system", cached: true };
    }
    throw new Error(`OpenCode binary not found. Install it manually or set OPENCODE_BINARY env var.`);
  }
}

export function runOpenCode(binaryPath: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string {
  const env = {
    ...process.env,
    ...(opts?.env ?? {}),
    OPENCODE_CLI: "true",
  };

  const allowedKeys: string[] = ["OPENCODE_API_KEY", "OPENCODE_BASE_URL", "GITHUB_TOKEN", "OPENCODE_CLI", "PATH", "HOME", "NODE_ENV"];
  const sandboxed: Record<string, string> = {};
  for (const key of allowedKeys) {
    const val = env[key as keyof typeof env];
    if (val) sandboxed[key] = val;
  }

  const result = execSync(`"${binaryPath}" ${args.join(" ")}`, {
    cwd: opts?.cwd,
    env: sandboxed,
    encoding: "utf8",
    timeout: 120_000,
  });
  return result.trim();
}

interface ReleaseInfo {
  tag_name: string;
  assets: { name: string; browser_download_url?: string; url: string }[];
}

async function fetchReleaseInfo(version: string): Promise<ReleaseInfo> {
  const url = version === "latest" ? OPENCODE_RELEASES : `https://api.github.com/repos/anomalyco/opencode/releases/tags/${version}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "codesentinel-ai" },
    });
  } catch (err) {
    throw new Error(`Failed to fetch release info: ${err}`);
  }
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  return res.json() as Promise<ReleaseInfo>;
}

function findAsset(release: ReleaseInfo, binaryName: string): { name: string; url: string } | null {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "x86_64" : process.arch;
  for (const asset of release.assets) {
    if (asset.name.includes(platform) && asset.name.includes(arch) && asset.name.includes(binaryName.replace(".exe", ""))) {
      return { name: asset.name, url: asset.browser_download_url ?? asset.url };
    }
  }
  return null;
}

async function downloadBinary(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Failed to download binary: ${err}`);
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new Error(`Failed to read binary response: ${err}`);
  }
  return buffer;
}

async function verifyChecksum(buffer: Buffer, release: ReleaseInfo, assetName: string): Promise<void> {
  const sha256Asset = release.assets?.find((a) => a.name.endsWith(".sha256") || a.name.endsWith("SHA256SUMS"));
  if (!sha256Asset) {
    logger.info("OpenCode: no checksum asset found, skipping verification");
    return;
  }

  let checksumText: string;
  try {
    const res = await fetch(sha256Asset.url, {
      headers: { "Accept": "application/octet-stream", "User-Agent": "codesentinel-ai" },
    });
    if (!res.ok) {
      logger.warn(`OpenCode: checksum asset download failed (${res.status}), skipping verification`);
      return;
    }
    checksumText = await res.text();
  } catch (err) {
    logger.warn(`OpenCode: checksum download failed (${err}), skipping verification`);
    return;
  }

  const expected = parseChecksum(checksumText, assetName);
  if (!expected) {
    logger.warn(`OpenCode: no hash found for ${assetName} in checksum file, skipping verification`);
    return;
  }

  const actual = createHash("sha256").update(buffer).digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `OpenCode: checksum mismatch for ${assetName} — expected ${expected}, got ${actual}. ` +
      `Refusing to install a tampered binary. Set OPENCODE_VERSION to a known-good release or install manually.`,
    );
  }
  logger.info("OpenCode: checksum verified");
}

export function parseChecksum(text: string, assetName: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // SHA256SUMS format: "<hash>  <filename>"
    const shaLine = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (shaLine && shaLine[2].includes(assetName)) return shaLine[1];
    // Single-hash .sha256 format: either "<hash>  <filename>" or just "<hash>"
    const bareHash = line.match(/^([a-fA-F0-9]{64})$/);
    if (bareHash && lines.length === 1) return bareHash[1];
  }
  return null;
}

function checkSystemPath(binaryName: string): string | null {
  try {
    const result = execSync(`which ${binaryName}`, { encoding: "utf8" });
    return result.trim();
  } catch {
    return null;
  }
}
