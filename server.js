const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ថតសម្រាប់រក្សាទុកវីដេអូ
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Route ទាញយកវីដេអូ
app.post('/download', async (req, res) => {
    const { url, quality } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'សូមបញ្ចូល URL' });
    }

    try {
        // ទាញយកព័ត៌មានវីដេអូ
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            preferFreeFormats: true,
        });

        const safeTitle = info.title.replace(/[^a-zA-Z0-9ក-៩]/g, '_').substring(0, 100);
        const outputPath = path.join(downloadsDir, `${safeTitle}.%(ext)s`);

        // កំណត់ Format តាមគុណភាពដែលបានជ្រើសរើស (ទាញយកកម្រិតអតិបរមាដែលជ្រើសរើស)
        let formatOption = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'; // Default គឺល្អបំផុត
        if (quality && quality !== 'best') {
            formatOption = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;
        }

        // ទាញយកវីដេអូ
        await youtubedl.exec(url, {
            output: outputPath,
            format: formatOption,
            mergeOutputFormat: 'mp4',
            noWarnings: true,
            restrictFilenames: true,
            concurrentFragments: 10, // ទាញយកបំណែកវីដេអូច្រើនក្នុងពេលតែមួយ (ជួយឲ្យលឿនជាងមុន)
            forceIpv4: true // ជួយកាត់បន្ថយការរាំងខ្ទប់ល្បឿនពី YouTube
        });

        const finalFileName = `${safeTitle}.mp4`;
        const filePath = path.join(downloadsDir, finalFileName);

        res.json({
            success: true,
            title: info.title,
            thumbnail: info.thumbnail || '',
            downloadUrl: `/download-file/${finalFileName}`,
            duration: info.duration
        });
        
        // មុខងារបើក Folder ដោយស្វ័យប្រវត្តិពេលទាញយករួច (សម្រាប់ Windows)
        if (process.platform === 'win32') {
            exec(`explorer.exe "${downloadsDir}"`);
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            error: 'មិនអាចទាញយកបានទេ។ សូមពិនិត្យ URL ម្តងទៀត។' 
        });
    }
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

app.listen(PORT, () => {
    console.log(`🚀 Server ដំណើរការនៅ http://localhost:${PORT}`);
});