const nodemailer = require('nodemailer');

const isMailConfigured = 
    process.env.SMTP_HOST && 
    process.env.SMTP_PORT && 
    process.env.SMTP_USER && 
    process.env.SMTP_PASS;

let transporter = null;

if (isMailConfigured) {
    transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT, 10),
        secure: false, // STARTTLS on port 587
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

const sendVerificationEmail = async (email, code) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL: no SMTP configured] ---');
        console.warn(`To: ${email}`);
        console.warn(`Verification Code: ${code}`);
        console.warn('---------------------------------------');
        return;
    }

    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      email,
            subject: 'emissiON – E-posta Doğrulama Kodunuz',
            text:    `Doğrulama kodunuz: ${code}\n\nBu kod 120 saniye geçerlidir.`,
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
                        Bu kod 120 saniye geçerlidir.<br>
                        Eğer bu işlemi siz yapmadıysanız lütfen dikkate almayın.
                    </p>
                </div>
            `,
        });
    } catch (err) {
        console.error('[sendVerificationEmail] SMTP send failed:', err.message);
        console.warn('--- [DEV FALLBACK: use this code manually] ---');
        console.warn(`To: ${email}`);
        console.warn(`Verification Code: ${code}`);
        console.warn('----------------------------------------------');
    }
};

const sendPasswordResetEmail = async (email, resetLink) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL: no SMTP configured] ---');
        console.warn(`To: ${email}`);
        console.warn(`Reset Link: ${resetLink}`);
        console.warn('---------------------------------------');
        return;
    }

    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      email,
            subject: 'emissiON – Şifre Sıfırlama',
            text:    `Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n\n${resetLink}\n\nBu bağlantı 15 dakika geçerlidir.\nEğer bu işlemi siz yapmadıysanız lütfen dikkate almayın.`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                    <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                    <p style="color:#444">Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:</p>
                    <div style="margin:20px 0;text-align:center">
                        <a href="${resetLink}"
                           style="display:inline-block;padding:12px 28px;background:#2d6a4f;color:#fff;
                                  text-decoration:none;border-radius:6px;font-weight:bold;font-size:1rem">
                            Şifremi Sıfırla
                        </a>
                    </div>
                    <p style="color:#888;font-size:0.85rem">
                        Bu bağlantı 15 dakika geçerlidir.<br>
                        Eğer bu işlemi siz yapmadıysanız lütfen dikkate almayın.
                    </p>
                    <p style="color:#aaa;font-size:0.75rem;word-break:break-all">
                        Buton çalışmıyorsa şu adresi tarayıcınıza kopyalayın:<br>${resetLink}
                    </p>
                </div>
            `,
        });
    } catch (err) {
        console.error('[sendPasswordResetEmail] SMTP send failed:', err.message);
        console.warn('--- [DEV FALLBACK: open this link manually] ---');
        console.warn(`To: ${email}`);
        console.warn(`Reset Link: ${resetLink}`);
        console.warn('------------------------------------------------');
    }
};

// Sent to the NEW email address to verify an email change request.
// Always sent — not subject to notification preferences.
const sendEmailChangeVerification = async (newEmail, code) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL SERVICE] ---');
        console.warn(`To (new address): ${newEmail}`);
        console.warn(`Email Change Code: ${code}`);
        console.warn('---------------------------');
        return;
    }
    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      newEmail,
            subject: 'emissiON – E-posta Değişikliği Doğrulama',
            text:    `E-posta değişikliğinizi onaylamak için kod: ${code}\n\nBu kod 10 dakika geçerlidir.\nEğer bu işlemi siz yapmadıysanız dikkate almayın.`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                    <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                    <p style="color:#444">Bu e-posta adresini hesabınıza bağlamak için doğrulama kodunuzu girin:</p>
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
    } catch (err) {
        console.error('[sendEmailChangeVerification] SMTP send failed:', err.message);
        console.warn('--- [DEV FALLBACK: email change code] ---');
        console.warn(`To: ${newEmail}`);
        console.warn(`Code: ${code}`);
        console.warn('-----------------------------------------');
    }
};

// Sent to the CURRENT email address to verify a password change request.
// Always sent — not subject to notification preferences.
const sendPasswordChangeVerification = async (email, code) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL SERVICE] ---');
        console.warn(`To: ${email}`);
        console.warn(`Password Change Code: ${code}`);
        console.warn('---------------------------');
        return;
    }
    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      email,
            subject: 'emissiON – Şifre Değişikliği Doğrulama',
            text:    `Şifre değişikliğinizi onaylamak için kod: ${code}\n\nBu kod 10 dakika geçerlidir.\nBu işlemi siz başlatmadıysanız hemen şifrenizi sıfırlayın.`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                    <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                    <p style="color:#444">Şifre değişikliği talebinizi onaylamak için bu kodu kullanın:</p>
                    <div style="font-size:2rem;font-weight:bold;letter-spacing:0.4rem;color:#1b4332;
                                padding:20px;background:#d8f3dc;border-radius:8px;text-align:center;
                                margin:20px 0">
                        ${code}
                    </div>
                    <p style="color:#888;font-size:0.85rem">
                        Bu kod 10 dakika geçerlidir.<br>
                        <strong>Bu işlemi siz başlatmadıysanız hemen şifrenizi sıfırlayın.</strong>
                    </p>
                </div>
            `,
        });
    } catch (err) {
        console.error('[sendPasswordChangeVerification] SMTP send failed:', err.message);
        console.warn('--- [DEV FALLBACK: password change code] ---');
        console.warn(`To: ${email}`);
        console.warn(`Code: ${code}`);
        console.warn('--------------------------------------------');
    }
};

// Security alert sent to the OLD email after a successful email change.
// Only sent when email_notifications = true.
const sendEmailChangedAlert = async (oldEmail, newEmail) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL SERVICE] ---');
        console.warn(`To (old address): ${oldEmail}`);
        console.warn(`Email changed to: ${newEmail}`);
        console.warn('---------------------------');
        return;
    }
    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      oldEmail,
            subject: 'emissiON – E-posta Adresiniz Değiştirildi',
            text:    `Hesabınızın e-posta adresi ${newEmail} olarak güncellendi.\n\nBu değişikliği siz yapmadıysanız lütfen destek ekibimizle iletişime geçin.`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                    <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                    <p style="color:#444">Hesabınızın e-posta adresi başarıyla değiştirildi.</p>
                    <p style="color:#444">Yeni e-posta: <strong>${newEmail}</strong></p>
                    <p style="color:#c0392b;font-size:0.85rem">
                        Bu değişikliği siz yapmadıysanız lütfen hemen destek ekibimizle iletişime geçin.
                    </p>
                </div>
            `,
        });
    } catch (err) {
        console.error('[sendEmailChangedAlert] Error:', err.message);
    }
};

// Security alert sent after a successful password change.
// Only sent when email_notifications = true.
const sendPasswordChangedAlert = async (email) => {
    if (!transporter) {
        console.warn('--- [MOCK MAIL SERVICE] ---');
        console.warn(`To: ${email}`);
        console.warn('Password changed successfully (security alert).');
        console.warn('---------------------------');
        return;
    }
    try {
        await transporter.sendMail({
            from:    process.env.EMAIL_FROM || '"emissiON" <noreply@emission.com>',
            to:      email,
            subject: 'emissiON – Şifreniz Değiştirildi',
            text:    `Hesabınızın şifresi başarıyla güncellendi.\n\nBu değişikliği siz yapmadıysanız lütfen hemen şifrenizi sıfırlayın.`,
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                    <h2 style="color:#2d6a4f;margin-bottom:4px">emissiON</h2>
                    <p style="color:#444">Hesabınızın şifresi başarıyla değiştirildi.</p>
                    <p style="color:#c0392b;font-size:0.85rem">
                        Bu değişikliği siz yapmadıysanız lütfen hemen
                        <a href="/pages/forgot-password.html" style="color:#c0392b">şifrenizi sıfırlayın</a>.
                    </p>
                </div>
            `,
        });
    } catch (err) {
        console.error('[sendPasswordChangedAlert] Error:', err.message);
    }
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendEmailChangeVerification,
    sendPasswordChangeVerification,
    sendEmailChangedAlert,
    sendPasswordChangedAlert,
};

