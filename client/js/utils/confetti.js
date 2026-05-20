const COLORS = ['#5BAD8E', '#7BC8E8', '#7ADACE', '#F8D98A', '#C4B4F5', '#F5A8B0'];

export function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const pieces = Array.from({ length: 90 }, () => ({
        x:    Math.random() * canvas.width,
        y:    -10 - Math.random() * 100,
        vx:   (Math.random() - 0.5) * 5,
        vy:   Math.random() * 4 + 2,
        size: Math.random() * 9 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot:  Math.random() * 360,
        rotV: (Math.random() - 0.5) * 10,
    }));

    let frame = 0;
    const maxFrames = 130;

    (function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const alpha = Math.max(0, 1 - frame / maxFrames);
        pieces.forEach(p => {
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.06;
            p.rot += p.rotV;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillStyle   = p.color;
            ctx.globalAlpha = alpha;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
            ctx.restore();
        });
        frame++;
        if (frame < maxFrames) requestAnimationFrame(draw);
        else canvas.remove();
    })();
}

export function showXpGain(amount, anchorEl) {
    const el = document.createElement('div');
    const rect = anchorEl
        ? anchorEl.getBoundingClientRect()
        : { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0 };

    el.textContent  = `+${amount} XP`;
    el.style.cssText = `
        position:fixed;
        top:${rect.top + window.scrollY - 10}px;
        left:${rect.left + rect.width / 2}px;
        transform:translate(-50%,0);
        font-family:'Outfit',sans-serif;
        font-weight:800;font-size:20px;
        color:#F8D98A;
        text-shadow:0 2px 10px rgba(0,0,0,0.6);
        pointer-events:none;z-index:99999;
        animation:xpFloat 1.5s ease-out forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

export function showLevelUp(level, onDismiss) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;
        background:rgba(0,0,0,0.65);
        backdrop-filter:blur(14px);
        z-index:100000;
        display:flex;align-items:center;justify-content:center;
    `;
    overlay.innerHTML = `
        <div style="
            background:var(--color-surface);
            border:2px solid var(--color-primary);
            border-radius:24px;
            padding:48px 56px;
            text-align:center;
            max-width:380px;
            animation:levelPulse 0.5s ease-out;
            box-shadow:0 0 60px rgba(91,173,142,0.25);
        ">
            <div style="font-size:72px;margin-bottom:12px;line-height:1;">🎉</div>
            <h2 style="font-size:26px;font-weight:800;color:var(--color-primary);margin:0 0 8px;">Seviye Atladın!</h2>
            <p style="font-size:18px;color:var(--color-text-muted);margin:0 0 28px;">
                Artık <strong style="color:var(--color-text)">Seviye ${level}</strong> karbon savaşçısısın!
            </p>
            <button id="levelUpDismiss" style="
                background:var(--color-primary);color:white;
                border:none;border-radius:12px;
                padding:13px 36px;font-size:16px;font-weight:700;
                cursor:pointer;transition:background 0.2s;
            ">Muhteşem!</button>
        </div>`;
    document.body.appendChild(overlay);
    const dismiss = () => { overlay.remove(); onDismiss?.(); };
    overlay.querySelector('#levelUpDismiss').onclick = dismiss;
    overlay.onclick = (e) => { if (e.target === overlay) dismiss(); };
}

export function showBadgeUnlock(badge, showToastFn) {
    if (showToastFn) {
        showToastFn(`${badge.icon} Rozet Kazandın!`, `"${badge.name}" rozetini kazandın!`, 'success');
    }
}
