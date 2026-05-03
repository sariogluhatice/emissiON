const pool = require('../config/db');

// GET /api/individual-comparison
const getIndividualComparison = async (req, res) => {
    const userId = req.user.id;
    const role   = req.user.role;

    // Yalnızca bireysel kullanıcılar bu özelliği kullanabilir
    if (role !== 'individual') {
        return res.status(403).json({
            success: false,
            message: 'Bu özellik yalnızca bireysel kullanıcılar için kullanılabilir.',
        });
    }

    try {
        // Tüm individual kullanıcıların toplam emisyonlarını tek sorguda çek
        const result = await pool.query(`
            SELECT
                u.id,
                COALESCE(SUM(e.amount), 0)::float AS total_emission
            FROM users u
            LEFT JOIN emission_records e ON e.user_id = u.id
            WHERE u.role = 'individual'
            GROUP BY u.id
        `);

        const rows = result.rows;

        // Mevcut kullanıcı satırını bul
        const currentUserRow      = rows.find(r => parseInt(r.id, 10) === userId);
        const currentUserEmission = currentUserRow ? parseFloat(currentUserRow.total_emission) : 0;

        // Kullanıcının hiç emisyon kaydı yoksa
        if (currentUserEmission === 0) {
            return res.status(200).json({
                success:               true,
                comparisonAvailable:   false,
                message:               'Karşılaştırma yapabilmek için önce emisyon kaydı eklemelisiniz.',
            });
        }

        const totalIndividualUsers = rows.length;

        // Toplam individual kullanıcı sayısı 1 ise (sadece mevcut kullanıcı)
        if (totalIndividualUsers <= 1) {
            return res.status(200).json({
                success:               true,
                comparisonAvailable:   false,
                message:               'Karşılaştırma için yeterli bireysel kullanıcı verisi yok.',
            });
        }

        // Diğer individual kullanıcıların herhangi bir emisyon kaydı var mı?
        const otherUsersWithRecords = rows.filter(
            r => parseInt(r.id, 10) !== userId && parseFloat(r.total_emission) > 0
        );

        if (otherUsersWithRecords.length === 0) {
            return res.status(200).json({
                success:               true,
                comparisonAvailable:   false,
                message:               'Karşılaştırma için yeterli emisyon verisi bulunmuyor.',
            });
        }

        // Mevcut kullanıcıdan DAHA YÜKSEK emisyona sahip kullanıcı sayısı
        const usersWithHigherEmission = rows.filter(
            r => parseFloat(r.total_emission) > currentUserEmission
        ).length;

        // Percentile: daha yüksek emisyon yapan kullanıcıların toplam içindeki yüzdesi
        const percentile = Math.round((usersWithHigherEmission / totalIndividualUsers) * 100);

        // Mesaj üret
        const message = percentile === 0
            ? 'Bireysel kullanıcılar arasında en yüksek emisyon grubundasınız.'
            : `Diğer bireysel kullanıcıların %${percentile}'inden daha az karbon salımı yapıyorsunuz.`;

        // Performans rozeti
        let badge, badgeDescription;
        if (percentile >= 80) {
            badge            = 'Çok iyi';
            badgeDescription = 'Bireysel kullanıcılar arasında düşük emisyon grubundasınız.';
        } else if (percentile >= 50) {
            badge            = 'İyi';
            badgeDescription = 'Ortalamanın altında karbon salımı yapıyorsunuz.';
        } else {
            badge            = 'Geliştirilebilir';
            badgeDescription = 'Karbon ayak izinizi azaltmak için iyileştirme alanlarınız var.';
        }

        return res.status(200).json({
            success:                  true,
            comparisonAvailable:      true,
            userTotalEmission:        parseFloat(currentUserEmission.toFixed(2)),
            totalIndividualUsers,
            usersWithHigherEmission,
            percentile,
            message,
            badge,
            badgeDescription,
        });

    } catch (err) {
        console.error('[getIndividualComparison]', err.message);
        return res.status(500).json({
            success:  false,
            message:  'Sunucu hatası.',
        });
    }
};

module.exports = { getIndividualComparison };
