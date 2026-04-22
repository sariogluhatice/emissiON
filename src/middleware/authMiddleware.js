const jwt = require('jsonwebtoken');

// Bu ara katman (middleware), giriş yapmış bir kullanıcı gerektiren rotaları korur.
// Kimlik doğrulama gereken her rotaya bu fonksiyonu ekleyebilirsiniz.
// Kullanım: router.get('/korumali-rota', authenticate, handler)
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Beklenen başlık formatı: "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token sağlanmadı.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role } bilgisi artık bir sonraki işleyicide (handler) mevcuttur
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    }
};

module.exports = { authenticate };
