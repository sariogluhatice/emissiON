const pool = require('../config/db');

const getIndividualComparison = async (userId) => {
    const { rows } = await pool.query(`
        WITH all_totals AS (
            SELECT u.id,
                   COALESCE(SUM(e.amount), 0)::float AS total_emission
            FROM users u
            LEFT JOIN emission_records e ON e.user_id = u.id
            WHERE u.role = 'individual'
            GROUP BY u.id
        ),
        user_total AS (
            SELECT total_emission FROM all_totals WHERE id = $1
        )
        SELECT
            (SELECT total_emission FROM user_total)                                        AS user_total,
            COUNT(*)                                                                        AS total_users,
            COUNT(*) FILTER (WHERE total_emission > (SELECT total_emission FROM user_total)) AS users_higher,
            COUNT(*) FILTER (WHERE id != $1 AND total_emission > 0)                        AS others_with_records
        FROM all_totals
    `, [userId]);

    const row                     = rows[0];
    const currentUserEmission     = parseFloat(row.user_total ?? 0);
    const totalIndividualUsers    = parseInt(row.total_users, 10);
    const usersWithHigherEmission = parseInt(row.users_higher, 10);
    const othersWithRecords       = parseInt(row.others_with_records, 10);

    if (currentUserEmission === 0) {
        return { comparisonAvailable: false, message: 'Karşılaştırma yapabilmek için önce emisyon kaydı eklemelisiniz.' };
    }

    if (totalIndividualUsers <= 1) {
        return { comparisonAvailable: false, message: 'Karşılaştırma için yeterli bireysel kullanıcı verisi yok.' };
    }

    if (othersWithRecords === 0) {
        return { comparisonAvailable: false, message: 'Karşılaştırma için yeterli emisyon verisi bulunmuyor.' };
    }

    const percentile = Math.round((usersWithHigherEmission / totalIndividualUsers) * 100);

    const message = percentile === 0
        ? 'Bireysel kullanıcılar arasında en yüksek emisyon grubundasınız.'
        : `Diğer bireysel kullanıcıların %${percentile}'inden daha az karbon salımı yapıyorsunuz.`;

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

    return {
        comparisonAvailable:   true,
        userTotalEmission:     parseFloat(currentUserEmission.toFixed(2)),
        totalIndividualUsers,
        usersWithHigherEmission,
        percentile,
        message,
        badge,
        badgeDescription,
    };
};

module.exports = { getIndividualComparison };
