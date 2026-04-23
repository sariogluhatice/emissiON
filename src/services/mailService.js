const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT, 10),
    secure: false, // STARTTLS on port 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendVerificationEmail = async (email, code) => {
    await transporter.sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'emissiON – E-posta Doğrulama Kodunuz',
        text:    `Doğrulama kodunuz: ${code}\n\nBu kod 10 dakika geçerlidir.`,
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                <p style="color:#444">Hesabınızı doğrulamak için aşağıdaki kodu kullanın:</p>
                <div style="font-size:2rem;font-weight:bold;letter-spacing:0.4rem;color:#1b4332;
                            padding:20px;background:#d8f3dc;border-radius:8px;text-align:center;
                            margin:20px 0">
                    ${code}
                </div>
                <p style="color:#888;font-size:0.85rem">
                    Bu kod 10 dakika geçerlidir.<br>
                    Eğer bu işlemi siz yapmadıysanız lütfen dikkate almayın.
                </p>
            </div>
        `,
    });
};

module.exports = { sendVerificationEmail };
