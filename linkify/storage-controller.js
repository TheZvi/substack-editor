// storage-controller.js
console.log("Storage controller loading");

// Only define if not already defined
if (!window.RuleStorage) {
    window.RuleStorage = class {
        static async getDefaultRules() {
            const response = await fetch(chrome.runtime.getURL('linkify/default-rules.json'));
            const data = await response.json();
            return data.linkRules;
        }

        // Linkify rules live in chrome.storage.local, NOT sync: sync caps each
        // item at 8KB (Resource::kQuotaBytesPerItem) and a growing userRules
        // array exceeds that, making every save fail. local allows ~10MB.
        // One-time migration copies any pre-existing sync data into local;
        // the sync copy is left in place as a passive backup but is never
        // written again.
        static async migrateFromSync() {
            if (this._migrated) return;
            const local = await chrome.storage.local.get(['userRules', 'overrides']);
            const toSet = {};
            if (local.userRules === undefined || local.overrides === undefined) {
                const synced = await chrome.storage.sync.get(['userRules', 'overrides']);
                if (local.userRules === undefined && synced.userRules) {
                    toSet.userRules = synced.userRules;
                }
                if (local.overrides === undefined && synced.overrides) {
                    toSet.overrides = synced.overrides;
                }
                if (Object.keys(toSet).length > 0) {
                    await chrome.storage.local.set(toSet);
                    console.log("[Linkify Storage] Migrated from sync to local:", Object.keys(toSet).join(', '));
                }
            }
            this._migrated = true;
        }

        static async getUserRules() {
            await this.migrateFromSync();
            const { userRules = [] } = await chrome.storage.local.get('userRules');
            return userRules;
        }

        static async getOverrides() {
            await this.migrateFromSync();
            const { overrides = {} } = await chrome.storage.local.get('overrides');
            return overrides;
        }

        static async getAllRules() {
            const [defaultRules, userRules, overrides] = await Promise.all([
                this.getDefaultRules(),
                this.getUserRules(),
                this.getOverrides()
            ]);

            return {
                defaultRules: defaultRules.map(rule => ({
                    ...rule,
                    isDefault: true,
                    isDisabled: overrides[rule.target]?.disabled || false
                })),
                userRules: userRules.map(rule => ({
                    ...rule,
                    isDefault: false
                }))
            };
        }

        static async addUserRule(rule) {
            const userRules = await this.getUserRules();
            userRules.push(rule);
            await chrome.storage.local.set({ userRules });
        }

        static async deleteUserRule(target) {
            const userRules = await this.getUserRules();
            const newRules = userRules.filter(rule => rule.target !== target);
            await chrome.storage.local.set({ userRules: newRules });
        }
        static async updateOverride(target, override) {
            const overrides = await this.getOverrides();
            overrides[target] = override;
            await chrome.storage.local.set({ overrides });
        }

        static async exportAllRules() {
            const { defaultRules, userRules } = await this.getAllRules();
            const combined = {
                linkRules: [
                    ...defaultRules.filter(r => !r.isDisabled),
                    ...userRules
                ].map(({ isDefault, isDisabled, ...rule }) => rule)
            };
            return JSON.stringify(combined, null, 2);
        }

        static async toggleRule(target, disable) {
            const overrides = await this.getOverrides();
            if (disable) {
                overrides[target] = { ...overrides[target], disabled: true };
            } else {
                if (overrides[target]) {
                    delete overrides[target].disabled;
                    // Clean up empty override objects
                    if (Object.keys(overrides[target]).length === 0) {
                        delete overrides[target];
                    }
                }
            }
            await chrome.storage.local.set({ overrides });
        }
    }
}

console.log("Storage controller loaded");