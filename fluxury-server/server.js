import express from 'express'
import cors from 'cors'
import { downloadBeat } from './download.js'
import fs from 'fs'
import path from 'path'

const app = express()
const port = 3001

app.use(cors())
app.use(express.json())

// Serve .wav files statically from /beats
app.use('/beats', express.static('beats'))

app.post('/api/download', async (req, res) => {
    const { url } = req.body
    if (!url) return res.status(400).send('Missing YouTube URL')

    try {
        const result = await downloadBeat(url)
        res.status(200).json(result)
    } catch (err) {
        console.error(err)
        res.status(500).send('Failed to download audio')
    }
})



app.listen(port, () => {
    console.log(`Beat download server running at http://localhost:${port}`)
})


// List all beats
app.get('/api/beats', (req, res) => {
    const beatsDir = path.join(process.cwd(), 'beats')

    fs.readdir(beatsDir, (err, files) => {
        if (err) {
            console.error('❌ Error reading beats directory:', err)
            return res.status(500).send('Unable to list beats')
        }

        // Only return .wav files with metadata
        const beats = files
            .filter(file => file.endsWith('.wav'))
            .map(file => ({
                name: file.replace(/\.wav$/, ''),
                path: `/beats/${file}`
            }))

        console.log('📁 Returning beat list:', beats.length)
        res.json(beats)
    })
})