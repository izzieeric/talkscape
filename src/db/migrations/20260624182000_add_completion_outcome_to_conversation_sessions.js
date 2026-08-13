/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('conversation_sessions');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('conversation_sessions', 'completion_outcome');
  if (hasColumn) return;

  await knex.schema.alterTable('conversation_sessions', (table) => {
    table.string('completion_outcome', 32).notNullable().defaultTo('success');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('conversation_sessions');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('conversation_sessions', 'completion_outcome');
  if (!hasColumn) return;

  await knex.schema.alterTable('conversation_sessions', (table) => {
    table.dropColumn('completion_outcome');
  });
};
