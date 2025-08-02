import { FetchError, ofetch } from "ofetch";

export default async function (audioId: number): Promise<{ success: true } | { success: false, reason: string }> {
    let audioMetadata;
    try {
        audioMetadata = await ofetch(`https://apis.roblox.com/assets/user-auth/v1/assets/${audioId}?readMask=assetId,assetType,creationContext,description,displayName,moderationResult,icon,previews,revisionCreateTime,State`, {
            headers: {
                Cookie: `.ROBLOSECURITY=${process.env.ROBLOX_ACCOUNT_COOKIE || ''}`
            }
        })
    } catch(err) {
        if (!(err instanceof FetchError)) return { success: true };

        if (err.response?.status === 404) {
            return { success: false, reason: "The provided audio ID does not exist." };
        }

        return { success: true }
    }

    const assetType = audioMetadata.assetType;
    if (assetType.toLowerCase() !== "audio") {
        return { success: false, reason: `:x: The provided [ID](https://create.roblox.com/store/asset/${audioId}) is not an audio asset.` }
    }

    const moderationState = audioMetadata.moderationResult.moderationState || "unknown" // "Approved", "Rejected", "Reviewing"
    if (moderationState.toLowerCase() === "rejected") {
        return { success: false, reason: `:x: This [audio](https://create.roblox.com/store/asset/${audioId}) was rejected by roblox moderation.` }
    }

    if (moderationState.toLowerCase() === "reviewing") {
        return { success: false, reason: `:warning: This [audio](https://create.roblox.com/store/asset/${audioId}) is currently under review by roblox moderation. Please re-submit the audio once it has been approved.` }
    }

    return { success: true }
}