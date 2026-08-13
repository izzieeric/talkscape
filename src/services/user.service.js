const db = require('../db');

function sanitizeUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio || '',
    avatarText: row.avatar_text || 'T',
    email: row.email || '',
    phone: row.phone || '',
    authProvider: row.auth_provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

async function getUserById(userId) {
  const knex = db.getDb();
  const user = await knex('users').where({ id: userId }).first();
  return user;
}

async function getUserByUsername(username) {
  const knex = db.getDb();
  const user = await knex('users')
    .whereRaw('LOWER(TRIM(username)) = ?', [String(username || '').trim().toLowerCase()])
    .first();
  return user;
}

async function updateLastLogin(userId) {
  const knex = db.getDb();
  await knex('users')
    .where({ id: userId })
    .update({
      last_login_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });
}

async function updateProfile(userId, profile) {
  const knex = db.getDb();
  const currentUser = await getUserById(userId);
  if (!currentUser) throw new Error('User not found');

  const nextProfile = {
    displayName: String(profile.displayName || currentUser.display_name || '').trim() || currentUser.username,
    bio: String(profile.bio || '').trim().slice(0, 120),
    avatarText: String(profile.avatarText || currentUser.avatar_text || currentUser.username || 'T').trim().slice(0, 2).toUpperCase()
  };

  await knex('users')
    .where({ id: userId })
    .update({
      display_name: nextProfile.displayName,
      bio: nextProfile.bio,
      avatar_text: nextProfile.avatarText || 'T',
      updated_at: knex.fn.now()
    });

  return sanitizeUser(await getUserById(userId));
}

function calculateStreak(days) {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

async function getProfileSummary(userId) {
  const knex = db.getDb();
  const userRow = await getUserById(userId);
  const user = sanitizeUser(userRow);
  if (!user) throw new Error('User not found');

  const totalSessionsRes = await knex('conversation_sessions')
    .count('* as count')
    .where({ user_id: userId, del: 0 })
    .first();
  const totalSessions = Number(totalSessionsRes?.count || 0);

  const totalBookmarksRes = await knex('word_bookmarks')
    .count('* as count')
    .where({ user_id: userId })
    .whereNot({ status: 'deleted' })
    .first();
  const totalBookmarks = Number(totalBookmarksRes?.count || 0);

  const activeDaysRows = await knex('conversation_sessions')
    .distinct(knex.raw('DATE(COALESCE(completed_at, started_at)) AS day'))
    .where({ user_id: userId, del: 0 });
  const activeDayCount = activeDaysRows.length;

  const completedScenariosRes = await knex('conversation_sessions')
    .countDistinct('scenario_id as count')
    .where({ user_id: userId, status: 'completed', del: 0 })
    .whereNotNull('completed_at')
    .first();
  const completedScenarioCount = Number(completedScenariosRes?.count || 0);

  const totalMessagesRes = await knex('conversation_messages as cm')
    .innerJoin('conversation_sessions as cs', 'cs.id', 'cm.session_id')
    .count('* as count')
    .where('cs.user_id', userId)
    .andWhere('cs.del', 0)
    .andWhere('cm.del', 0)
    .whereIn('cm.role', ['user', 'ai'])
    .first();
  const totalConversationMessages = Number(totalMessagesRes?.count || 0);

  const recentWeekRows = await knex('conversation_sessions')
    .select(knex.raw('DATE(COALESCE(completed_at, started_at)) AS day'))
    .count('* as count')
    .where({ user_id: userId, del: 0 })
    .whereRaw("DATE(COALESCE(completed_at, started_at)) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)")
    .groupByRaw('DATE(COALESCE(completed_at, started_at))');

  const dayCountMap = new Map(recentWeekRows.map((row) => [row.day, Number(row.count)]));
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  const weekData = [];
  let maxCount = 0;
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    // adjust for local timezone offset when getting ISO date string
    const day = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const count = dayCountMap.get(day) || 0;
    maxCount = Math.max(maxCount, count);
    weekData.push({
      key: day,
      label: labels[date.getDay()],
      count
    });
  }

  return {
    user,
    stats: {
      totalSessions,
      totalBookmarks,
      streakDays: calculateStreak(activeDaysRows.map((row) => row.day)),
      activeDayCount,
      totalConversationMessages,
      completedScenarioCount
    },
    weekData: weekData.map((item) => ({
      ...item,
      pct: maxCount ? Math.max(12, Math.round((item.count / maxCount) * 100)) : 0
    }))
  };
}

async function getHistory(userId, limit = 20) {
  const knex = db.getDb();
  const sessions = await knex('conversation_sessions as cs')
    .select(
      'cs.id',
      'cs.status',
      'cs.current_turn',
      'cs.max_turns',
      'cs.started_at',
      'cs.completed_at',
      's.id as scenario_id',
      's.title',
      's.title_en',
      knex.raw(`(
        SELECT COUNT(*)
        FROM conversation_messages cm
        WHERE cm.session_id = cs.id AND cm.role = 'ai'
      ) AS ai_message_count`)
    )
    .leftJoin('scenarios as s', 's.id', 'cs.scenario_id')
    .where('cs.user_id', userId)
    .andWhere('cs.del', 0)
    .orderByRaw('COALESCE(cs.completed_at, cs.started_at) DESC')
    .limit(limit);

  return sessions.map((session) => ({
    id: session.id,
    scenarioId: session.scenario_id,
    title: session.title || session.title_en || session.scenario_id,
    titleEn: session.title_en || '',
    status: session.status,
    currentTurn: session.current_turn,
    maxTurns: session.max_turns,
    score: Math.min(100, Math.max(60, Number(session.ai_message_count || 0) * 12 + session.current_turn * 5)),
    startedAt: session.started_at,
    completedAt: session.completed_at
  }));
}

module.exports = {
  getHistory,
  getProfileSummary,
  getUserById,
  getUserByUsername,
  sanitizeUser,
  updateLastLogin,
  updateProfile
};
