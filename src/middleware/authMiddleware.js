const jwt = require('jsonwebtoken');

// This middleware protects routes that require a logged-in user.
// Attach it to any route that needs authentication.
// Usage: router.get('/protected', authenticate, handler)
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Expect the header format: "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role } is now available in the next handler
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

module.exports = { authenticate };
