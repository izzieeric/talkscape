/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('admin_ai_model_configs');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('admin_ai_model_configs', 'tts_voice');
  if (hasColumn) return;

  await knex.schema.alterTable('admin_ai_model_configs', (table) => {
    table.string('tts_voice', 100).notNullable().defaultTo('alloy');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('admin_ai_model_configs');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('admin_ai_model_configs', 'tts_voice');
  if (!hasColumn) return;

  await knex.schema.alterTable('admin_ai_model_configs', (table) => {
    table.dropColumn('tts_voice');
  });
};
