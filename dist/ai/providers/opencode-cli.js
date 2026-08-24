import { ProviderUnavailableError } from "../provider.js";
import { runReview } from "../../opencode/runner.js";
import { parseOpencodeOutput } from "../../opencode/jsonl-parser.js";
export function createOpencodeProvider(root) {
    return {
        name: "opencode-cli",
        async complete(req) {
            const result = await runReview(["."], { cwd: root });
            const lines = result.rawOutput.split("\n").filter((l) => l.trim());
            const parsed = parseOpencodeOutput(lines);
            return {
                content: JSON.stringify(parsed),
                model: req.model.model,
                provider: "opencode-cli",
                usage: { totalTokens: result.rawOutput.length },
            };
        },
    };
}
export class OpencodeCliAdapter {
    provider;
    fallback;
    config;
    constructor(config, root, fallback) {
        this.config = config;
        this.fallback = fallback ?? null;
        this.provider = createOpencodeProvider(root);
    }
    modelForTask(task) {
        return this.config.models[task] ?? this.config.default_model;
    }
    async complete(task, messages, opts) {
        try {
            const model = this.modelForTask(task);
            return await this.provider.complete({ model, messages, ...opts });
        }
        catch (err) {
            if (this.fallback && (err instanceof ProviderUnavailableError || err instanceof Error)) {
                return this.fallback.complete(task, messages, opts);
            }
            throw err;
        }
    }
}
//# sourceMappingURL=opencode-cli.js.map