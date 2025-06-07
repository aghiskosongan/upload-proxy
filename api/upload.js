export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const busboy = await import('busboy');
  const bb = busboy.default({ headers: req.headers });

  let fileBuffer = Buffer.alloc(0);
  let filename = '';

  bb.on('file', (_, file, info) => {
    filename = info.filename;
    file.on('data', (data) => {
      fileBuffer = Buffer.concat([fileBuffer, data]);
    });
  });

  bb.on('close', async () => {
    try {
      const serverRes = await fetch('https://api.gofile.io/v1/server');
      const serverJson = await serverRes.json();
      const server = serverJson.data.server;

      const uploadRes = await fetch(`https://${server}.gofile.io/uploadFile`, {
        method: 'POST',
        body: (() => {
          const form = new FormData();
          form.append('file', new Blob([fileBuffer]), filename);
          return form;
        })()
      });

      const uploadJson = await uploadRes.json();
      const url = uploadJson.data.downloadPage;

      return res.status(200).json({ filename, url });
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  req.pipe(bb);
}
