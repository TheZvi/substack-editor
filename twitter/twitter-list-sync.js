// twitter/twitter-list-sync.js
// Syncs Twitter Following list to a specified List using DOM scraping

console.log("[Twitter List Sync] Loading...");

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scroll and collect usernames - Twitter virtualizes the list so we collect as we go
 */
async function scrollAndCollect(maxScrolls = 300) {
    const collectedUsernames = new Set();
    let scrollCount = 0;
    let noNewUsersCount = 0;
    let previousCollectedCount = 0;

    console.log('[Twitter List Sync] Starting scroll and collect...');
    console.log('[Twitter List Sync] Document height:', document.body.scrollHeight);
    console.log('[Twitter List Sync] Window height:', window.innerHeight);

    while (scrollCount < maxScrolls && noNewUsersCount < 10) {
        // Collect usernames from currently visible cells BEFORE scrolling
        const userCells = document.querySelectorAll('[data-testid="UserCell"]');
        userCells.forEach(cell => {
            const spans = cell.querySelectorAll('span');
            for (const span of spans) {
                const text = span.textContent?.trim();
                if (text && text.startsWith('@') && text.length > 1) {
                    const username = text.substring(1);
                    if (/^[a-zA-Z0-9_]+$/.test(username)) {
                        collectedUsernames.add(username);
                        break;
                    }
                }
            }
        });

        // Scroll down
        window.scrollBy(0, window.innerHeight * 2);
        scrollCount++;

        // Wait for content to load
        await sleep(800);

        // Check if we collected new users
        if (collectedUsernames.size === previousCollectedCount) {
            noNewUsersCount++;
        } else {
            noNewUsersCount = 0;
        }

        // Log progress
        if (scrollCount % 5 === 0 || collectedUsernames.size !== previousCollectedCount) {
            console.log(`[Twitter List Sync] Scroll ${scrollCount}: ${collectedUsernames.size} total collected, ${userCells.length} cells visible, scrollY: ${window.scrollY}, docHeight: ${document.body.scrollHeight}`);
        }

        previousCollectedCount = collectedUsernames.size;
    }

    // One final collection after last scroll
    const finalCells = document.querySelectorAll('[data-testid="UserCell"]');
    finalCells.forEach(cell => {
        const spans = cell.querySelectorAll('span');
        for (const span of spans) {
            const text = span.textContent?.trim();
            if (text && text.startsWith('@') && text.length > 1) {
                const username = text.substring(1);
                if (/^[a-zA-Z0-9_]+$/.test(username)) {
                    collectedUsernames.add(username);
                    break;
                }
            }
        }
    });

    console.log(`[Twitter List Sync] Finished: ${scrollCount} scrolls, ${collectedUsernames.size} usernames collected`);
    return Array.from(collectedUsernames);
}


/**
 * Scrape all accounts from a Following page
 * Automatically scrolls and collects usernames as it goes
 */
window.scrapeFollowingList = async function() {
    console.log("[Twitter List Sync] Starting to scrape Following list...");

    // Verify we're on a following page
    if (!window.location.href.includes('/following')) {
        return { success: false, error: "Not on a Following page" };
    }

    // Scroll to top first
    window.scrollTo(0, 0);
    await sleep(1000);

    // Now scroll and collect
    const usernames = await scrollAndCollect(300);

    console.log(`[Twitter List Sync] Returning ${usernames.length} collected accounts`);

    return {
        success: true,
        usernames: usernames,
        count: usernames.length
    };
};

/**
 * Scrape all members from a List page
 * Must be called while on x.com/i/lists/LISTID/members
 */
window.scrapeListMembers = async function() {
    console.log("[Twitter List Sync] Starting to scrape List members...");

    // Scroll to top first
    window.scrollTo(0, 0);
    await sleep(1000);

    // Scroll and collect
    const usernames = await scrollAndCollect(300);

    console.log(`[Twitter List Sync] Found ${usernames.length} list members`);

    return {
        success: true,
        usernames: usernames,
        count: usernames.length
    };
};

/**
 * Add a user to a list using Twitter's internal API
 * This intercepts the GraphQL endpoint Twitter uses
 */
async function addUserToList(listId, userId) {
    // Twitter uses GraphQL for list operations
    // We need to find the correct endpoint and auth tokens

    // Get CSRF token from cookies
    const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('ct0='))
        ?.split('=')[1];

    if (!csrfToken) {
        throw new Error("Could not find CSRF token - are you logged in?");
    }

    // Twitter's GraphQL endpoint for adding to list
    const response = await fetch('https://x.com/i/api/graphql/lLNsL7mW6gSEQG6rXP7TNw/ListAddMember', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Csrf-Token': csrfToken,
            'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
            'X-Twitter-Active-User': 'yes',
            'X-Twitter-Auth-Type': 'OAuth2Session'
        },
        credentials: 'include',
        body: JSON.stringify({
            variables: {
                listId: listId,
                userId: userId
            },
            features: {
                rweb_lists_timeline_redesign_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true,
                verified_phone_label_enabled: false,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: true
            },
            queryId: 'lLNsL7mW6gSEQG6rXP7TNw'
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to add user: ${response.status} - ${text}`);
    }

    return await response.json();
}

/**
 * Remove a user from a list
 */
async function removeUserFromList(listId, userId) {
    const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('ct0='))
        ?.split('=')[1];

    if (!csrfToken) {
        throw new Error("Could not find CSRF token - are you logged in?");
    }

    const response = await fetch('https://x.com/i/api/graphql/cvDFdYqzNI3wFkIYmhiG3A/ListRemoveMember', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Csrf-Token': csrfToken,
            'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
            'X-Twitter-Active-User': 'yes',
            'X-Twitter-Auth-Type': 'OAuth2Session'
        },
        credentials: 'include',
        body: JSON.stringify({
            variables: {
                listId: listId,
                userId: userId
            },
            features: {
                rweb_lists_timeline_redesign_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true,
                verified_phone_label_enabled: false,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: true
            },
            queryId: 'cvDFdYqzNI3wFkIYmhiG3A'
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to remove user: ${response.status} - ${text}`);
    }

    return await response.json();
}

/**
 * Get user ID from username using Twitter's API
 * Includes retry logic for rate limits
 */
async function getUserIdFromUsername(username, retries = 3) {
    const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('ct0='))
        ?.split('=')[1];

    if (!csrfToken) {
        throw new Error("Could not find CSRF token");
    }

    const variables = encodeURIComponent(JSON.stringify({
        screen_name: username,
        withSafetyModeUserFields: true
    }));

    const features = encodeURIComponent(JSON.stringify({
        hidden_profile_likes_enabled: true,
        hidden_profile_subscriptions_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true
    }));

    for (let attempt = 0; attempt <= retries; attempt++) {
        const response = await fetch(`https://x.com/i/api/graphql/NimuplG1OB7Fd2btCLdBOw/UserByScreenName?variables=${variables}&features=${features}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Csrf-Token': csrfToken,
                'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'X-Twitter-Active-User': 'yes',
                'X-Twitter-Auth-Type': 'OAuth2Session'
            },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            return data?.data?.user?.result?.rest_id;
        }

        if (response.status === 429 && attempt < retries) {
            // Rate limited - wait with exponential backoff
            const waitTime = Math.pow(2, attempt + 1) * 30000; // 60s, 120s, 240s
            console.log(`[Twitter List Sync] Rate limited on ${username}, waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}`);
            await sleep(waitTime);
            continue;
        }

        throw new Error(`Failed to get user ID for ${username}: ${response.status}`);
    }
}

/**
 * Perform the sync operation
 * @param {string} listId - The Twitter list ID
 * @param {string[]} following - Array of usernames you're following
 * @param {string[]} listMembers - Array of usernames currently in the list
 * @param {string} mode - 'add', 'remove', or 'full'
 */
window.performListSync = async function(listId, following, listMembers, mode) {
    console.log(`[Twitter List Sync] Starting ${mode} sync...`);
    console.log(`[Twitter List Sync] Following: ${following.length}, List Members: ${listMembers.length}`);

    const followingSet = new Set(following.map(u => u.toLowerCase()));
    const listMemberSet = new Set(listMembers.map(u => u.toLowerCase()));

    const toAdd = [];
    const toRemove = [];

    // Find accounts to add (following but not in list)
    if (mode === 'add' || mode === 'full') {
        for (const username of following) {
            if (!listMemberSet.has(username.toLowerCase())) {
                toAdd.push(username);
            }
        }
    }

    // Find accounts to remove (in list but not following)
    if (mode === 'remove' || mode === 'full') {
        for (const username of listMembers) {
            if (!followingSet.has(username.toLowerCase())) {
                toRemove.push(username);
            }
        }
    }

    console.log(`[Twitter List Sync] To add: ${toAdd.length}, To remove: ${toRemove.length}`);

    const results = {
        added: [],
        removed: [],
        errors: []
    };

    // Process additions
    let consecutiveErrors = 0;
    for (let i = 0; i < toAdd.length; i++) {
        const username = toAdd[i];
        try {
            console.log(`[Twitter List Sync] Adding ${username} (${i + 1}/${toAdd.length})...`);
            const userId = await getUserIdFromUsername(username);
            if (userId) {
                await addUserToList(listId, userId);
                results.added.push(username);
                console.log(`[Twitter List Sync] Added ${username}`);
                consecutiveErrors = 0;
            } else {
                results.errors.push({ username, error: 'Could not find user ID' });
            }
            // Rate limiting - 3 seconds between requests
            await sleep(3000);
        } catch (error) {
            console.error(`[Twitter List Sync] Error adding ${username}:`, error);
            results.errors.push({ username, error: error.message });
            consecutiveErrors++;

            // If we get multiple consecutive errors, wait longer
            if (consecutiveErrors >= 3) {
                console.log(`[Twitter List Sync] Multiple errors, waiting 60s...`);
                await sleep(60000);
                consecutiveErrors = 0;
            }
        }
    }

    // Process removals
    consecutiveErrors = 0;
    for (let i = 0; i < toRemove.length; i++) {
        const username = toRemove[i];
        try {
            console.log(`[Twitter List Sync] Removing ${username} (${i + 1}/${toRemove.length})...`);
            const userId = await getUserIdFromUsername(username);
            if (userId) {
                await removeUserFromList(listId, userId);
                results.removed.push(username);
                console.log(`[Twitter List Sync] Removed ${username}`);
                consecutiveErrors = 0;
            } else {
                results.errors.push({ username, error: 'Could not find user ID' });
            }
            // Rate limiting - 3 seconds between requests
            await sleep(3000);
        } catch (error) {
            console.error(`[Twitter List Sync] Error removing ${username}:`, error);
            results.errors.push({ username, error: error.message });
            consecutiveErrors++;

            // If we get multiple consecutive errors, wait longer
            if (consecutiveErrors >= 3) {
                console.log(`[Twitter List Sync] Multiple errors, waiting 60s...`);
                await sleep(60000);
                consecutiveErrors = 0;
            }
        }
    }

    console.log(`[Twitter List Sync] Sync complete:`, results);
    return {
        success: true,
        added: results.added.length,
        removed: results.removed.length,
        errors: results.errors.length,
        details: results
    };
};

console.log("[Twitter List Sync] Ready");
