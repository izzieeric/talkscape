process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const { loadEnvFiles } = require('../src/config/load-env');

loadEnvFiles();

const knex = require('../src/db/knex');

const THEME_FREE_MODE_SUBTASK_ID = '__theme_free_mode__';

async function findInvalidSessions() {
  return knex('conversation_sessions as cs')
    .leftJoin('scenarios as s', 's.id', 'cs.scenario_id')
    .leftJoin('scenario_subtasks as st', function () {
      this.on('st.id', '=', 'cs.sub_task_id').andOn('st.scenario_id', '=', 'cs.scenario_id');
    })
    .where('cs.del', 0)
    .andWhere(function () {
      this.whereNull('s.id')
        .orWhere('s.is_active', '!=', 1)
        .orWhere(function () {
          this.whereNotNull('cs.sub_task_id')
            .andWhere('cs.sub_task_id', '!=', '')
            .andWhere('cs.sub_task_id', '!=', THEME_FREE_MODE_SUBTASK_ID)
            .andWhere(function () {
              this.whereNull('st.id').orWhere('st.is_active', '!=', 1);
            });
        });
    })
    .select(
      'cs.id',
      'cs.user_id',
      'cs.scenario_id',
      'cs.sub_task_id',
      'cs.status',
      'cs.started_at',
      's.is_active as scenario_active',
      'st.is_active as subtask_active'
    )
    .orderBy([{ column: 'cs.user_id', order: 'asc' }, { column: 'cs.started_at', order: 'desc' }]);
}

async function cleanupInvalidSessions() {
  const invalidSessions = await findInvalidSessions();
  const invalidSessionIds = invalidSessions.map((item) => item.id);

  if (!invalidSessionIds.length) {
    return {
      invalidSessions: [],
      deletedSessionCount: 0,
      deletedMessageCount: 0
    };
  }

  let deletedMessageCount = 0;
  let deletedSessionCount = 0;

  await knex.transaction(async (trx) => {
    deletedMessageCount = await trx('conversation_messages')
      .whereIn('session_id', invalidSessionIds)
      .andWhere('del', 0)
      .update({
        del: 1,
        deleted_at: trx.fn.now()
      });

    deletedSessionCount = await trx('conversation_sessions')
      .whereIn('id', invalidSessionIds)
      .andWhere('del', 0)
      .update({
        del: 1,
        deleted_at: trx.fn.now(),
        status: 'deleted'
      });
  });

  return {
    invalidSessions,
    deletedSessionCount,
    deletedMessageCount
  };
}

async function main() {
  try {
    const result = await cleanupInvalidSessions();
    console.log(JSON.stringify({
      mode: process.env.NODE_ENV,
      deletedSessionCount: result.deletedSessionCount,
      deletedMessageCount: result.deletedMessageCount,
      invalidSessions: result.invalidSessions
    }, null, 2));
  } catch (error) {
    console.error('[cleanup-invalid-sessions] failed:', error.message);
    process.exitCode = 1;
  } finally {
    await knex.destroy().catch(() => {});
  }
}

main();
