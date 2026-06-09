const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process'); // For opening folder
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/DATE', express.static(path.join(__dirname, 'DATE')));

// ថតសម្រាប់រក្សាទុកវីដេអូ
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// គ្រប់គ្រងការភ្ជាប់ពី Client
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Route ទាញយកវីដេអូ
app.post('/download', (req, res) => {
    const { url, quality, socketId } = req.body;

    if (!url || !socketId) {
        return res.status(400).json({ error: 'សូមបញ្ចូល URL និង Socket ID' });
    }

    // ឆ្លើយតបទៅ Client ភ្លាមៗថាដំណើរការបានចាប់ផ្តើម
    res.status(200).json({ message: "Download process initiated." });

    // ដំណើរការទាញយកនៅ Background
    (async () => {
        try {
            const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, preferFreeFormats: true });
            const safeTitle = info.title.replace(/[^a-zA-Z0-9ក-៩]/g, '_').substring(0, 100);
            const outputPath = path.join(downloadsDir, `${safeTitle}.%(ext)s`);

            let formatOption = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            if (quality && quality !== 'best') {
                formatOption = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;
            }

            const ytdlProcess = youtubedl.exec(url, {
                output: outputPath,
                format: formatOption,
                mergeOutputFormat: 'mp4',
                noWarnings: true,
                restrictFilenames: true,
                concurrentFragments: 10,
                forceIpv4: true
            });

            // តាមដាន Output ដើម្បីចាប់យកភាគរយ
            ytdlProcess.stdout.on('data', (data) => {
                const output = data.toString();
                const progressMatch = output.match(/\[download\]\s+([0-9\.]+)%/);
                if (progressMatch && progressMatch[1]) {
                    const percentage = parseFloat(progressMatch[1]);
                    io.to(socketId).emit('downloadProgress', { progress: percentage });
                }
            });

            // នៅពេលដំណើរការចប់
            ytdlProcess.on('close', (code) => {
                if (code === 0) { // បើជោគជ័យ
                    const finalFileName = `${safeTitle}.mp4`;
                    io.to(socketId).emit('downloadComplete', {
                        success: true,
                        title: info.title,
                        thumbnail: info.thumbnail || '',
                        downloadUrl: `/download-file/${finalFileName}`,
                    });
                    if (process.platform === 'win32') {
                        exec(`explorer.exe "${downloadsDir}"`);
                    }
                } else {
                    io.to(socketId).emit('downloadError', { error: 'ការទាញយកបានបរាជ័យ។' });
                }
            });

        } catch (error) {
            console.error(error);
            io.to(socketId).emit('downloadError', { error: 'មិនអាចទាញយកបានទេ។ សូមពិនិត្យ URL ម្តងទៀត។' });
        }
    })();
});

// Serve ឯកសារសម្រាប់ download
app.get('/download-file/:filename', (req, res) => {
    const file = path.join(downloadsDir, req.params.filename);
    
    if (fs.existsSync(file)) {
        res.download(file);
    } else {
        res.status(404).send('File not found');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Server ដំណើរការនៅ http://localhost:${PORT}`);
});