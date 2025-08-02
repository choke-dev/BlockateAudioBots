import { ofetch } from "ofetch";

export const fetchAudioUrls = async (id: number[]): Promise< { success: true, audioUrls: string[] } | { success: false, reason: string, code: number } >  => {
    console.log(`Fetching audio URLs for ${id.join(", ")}`)
    const audioUrlsResponse = await ofetch.raw('http://109.106.244.58:3789/audio/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: process.env.AUDIO_FILE_PROXY_AUTH || ''
        },
        body: id,
        ignoreResponseError: true
    });

    const responseStatus: number = audioUrlsResponse._data[0].code;

    switch(responseStatus) {
        case 403:
            return { success: false, reason: 'BMusicUploader does not have "Use" permissions for this audio. Please grant them the "Use" permission in the audio\'s permissions page.', code: responseStatus }
    }
    

    return { success: true, audioUrls: audioUrlsResponse._data }
}