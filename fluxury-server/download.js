import fs from 'fs'
import ytdl from 'ytdl-core'
import path from 'path'

const BEAT_DIR = './beats'
if (!fs.existsSync(BEAT_DIR)) fs.mkdirSync(BEAT_DIR)

export const downloadBeat = async (url, name) => {
    const info = await ytdl.getInfo(url)
    const fallback = info.videoDetails.title.replace(/[^\w\s]/gi, '').slice(0, 40)
    const baseName = name?.trim() || fallback
    const filename = `${baseName}-${Date.now()}.wav`
    const filepath = path.join(BEAT_DIR, filename)

    const stream = ytdl(url, { filter: 'audioonly' })
    const file = fs.createWriteStream(filepath)

    return new Promise((resolve, reject) => {
        stream.pipe(file)
        file.on('finish', () => {
            console.log(`✅ Beat downloaded: ${filename}`)
            resolve({ filename, path: `/beats/${filename}` })
        })
        stream.on('error', reject)
    })
}
