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

        static async getUserRules() {
            const { userRules = [] } = await chrome.storage.sync.get('userRules');
            return userRules;
        }

        static async getOverrides() {
            const { overrides = {} } = await chrome.storage.sync.get('overrides');
            return overrides;
        }

        static async getAllRules() {
            const [defaultRules, userRules, overrides] = await Promise.all([
                this.getDefaultRules(),
                this.getUserRules(),
                this.getOverrides()
            ]);
        
            console.log("Detailed rule comparison:", {
                defaultRule: defaultRules.find(r => r.target === "Battle of the Board"),
                userRule: userRules.find(r => r.target === "Battle of the Board")
            });
            console.log("Super detailed rule comparison:", {
                defaultRule: defaultRules.find(r => r.target === "Battle of the Board") && {
                    target: defaultRules.find(r => r.target === "Battle of the Board").target,
                    url: defaultRules.find(r => r.target === "Battle of the Board").url,
                    matchType: defaultRules.find(r => r.target === "Battle of the Board").matchType,
                    wholeWord: defaultRules.find(r => r.target === "Battle of the Board").wholeWord
                },
                userRule: userRules.find(r => r.target === "Battle of the Board") && {
                    target: userRules.find(r => r.target === "Battle of the Board").target,
                    url: userRules.find(r => r.target === "Battle of the Board").url,
                    matchType: userRules.find(r => r.target === "Battle of the Board").matchType,
                    wholeWord: userRules.find(r => r.target === "Battle of the Board").wholeWord
                }
            });
        
            // Additional logging for all instances where it should match
            console.log("All 'Battle of the Board' occurrences in text:", 
                document.body.innerText.match(/Battle of the Board/g));

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
            await chrome.storage.sync.set({ userRules });
        }

        static async deleteUserRule(target) {
            const userRules = await this.getUserRules();
            const newRules = userRules.filter(rule => rule.target !== target);
            await chrome.storage.sync.set({ userRules: newRules });
        }
        static async updateOverride(target, override) {
            const overrides = await this.getOverrides();
            overrides[target] = override;
            await chrome.storage.sync.set({ overrides });
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
            await chrome.storage.sync.set({ overrides });
        }
    }
}

console.log("Storage controller loaded");