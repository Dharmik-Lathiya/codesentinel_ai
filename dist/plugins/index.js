/**
 * PluginManager loads plugin modules (from config.plugins) and dispatches
 * lifecycle hooks. Modules must default-export a CodeSentinelPlugin.
 */
export class PluginManager {
    ctx;
    plugins = [];
    constructor(ctx) {
        this.ctx = ctx;
    }
    /** Dynamically import and register plugins listed in config. */
    async load(paths) {
        for (const p of paths) {
            try {
                const plugin = await this.loadPlugin(p);
                if (plugin) {
                    this.plugins.push(plugin);
                    await plugin.init?.(this.ctx);
                    this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
                }
            }
            catch (err) {
                this.ctx.logger.warn(`Failed to load plugin "${p}":`, err);
            }
        }
    }
    async loadPlugin(path) {
        try {
            const mod = (await import(path));
            return this.validatePlugin(path, mod.default);
        }
        catch (err) {
            this.ctx.logger.warn(`Failed to load plugin "${path}":`, err);
            return null;
        }
    }
    validatePlugin(path, plugin) {
        if (!plugin) {
            this.ctx.logger.warn(`Plugin "${path}" does not export a default CodeSentinelPlugin.`);
            return null;
        }
        if (typeof plugin.name !== "string" || plugin.name.length === 0) {
            this.ctx.logger.warn(`Plugin "${path}" is missing a valid "name" property.`);
            return null;
        }
        return plugin;
    }
    get all() {
        return [...this.plugins];
    }
    /** Run all plugins' analyze hooks and merge their findings. */
    async runAnalyze(files) {
        const results = await Promise.all(this.plugins.map((p) => this.runPluginAnalyze(p, files)));
        return results.flat();
    }
    async runPluginAnalyze(p, files) {
        try {
            return (await p.analyze?.(files)) ?? [];
        }
        catch (err) {
            this.ctx.logger.warn(`Analyze hook failed for plugin "${p.name}":`, err);
            return [];
        }
    }
    /** Run all plugins' score hooks sequentially. */
    async runScore(breakdown, files) {
        let b = breakdown;
        for (const p of this.plugins) {
            b = await this.runPluginScore(p, b, files);
        }
        return b;
    }
    async runPluginScore(p, breakdown, files) {
        try {
            return (await p.score?.(breakdown, files)) ?? breakdown;
        }
        catch (err) {
            this.ctx.logger.warn(`Score hook failed for plugin "${p.name}":`, err);
            return breakdown;
        }
    }
}
//# sourceMappingURL=index.js.map