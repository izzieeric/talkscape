/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. users
  await knex.schema.createTable('users', (table) => {
    table.string('id', 64).primary();
    table.string('username', 100).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('display_name', 100).notNullable();
    table.text('bio').defaultTo('');
    table.string('avatar_text', 10).defaultTo('T');
    table.string('email', 255).unique();
    table.string('phone', 20).unique();
    table.string('auth_provider', 50).notNullable().defaultTo('password');
    table.string('status', 20).notNullable().defaultTo('active');
    table.datetime('last_login_at');
    table.timestamps(true, true);
  });

  // 2. admin_users
  await knex.schema.createTable('admin_users', (table) => {
    table.string('id', 64).primary();
    table.string('username', 100).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('admin_name', 100).notNullable();
    table.string('avatar_text', 10).defaultTo('AD');
    table.string('role_code', 50).notNullable().defaultTo('operator');
    table.text('permissions').notNullable(); // Store JSON array
    table.string('status', 20).notNullable().defaultTo('active');
    table.datetime('last_login_at');
    table.string('last_login_ip', 64).defaultTo('');
    table.integer('token_version').notNullable().defaultTo(1);
    table.string('remark', 255).defaultTo('');
    table.string('created_by', 64).references('id').inTable('admin_users');
    table.timestamps(true, true);
    table.index(['status', 'username']);
  });

  // 3. scenario_categories
  await knex.schema.createTable('scenario_categories', (table) => {
    table.string('id', 64).primary();
    table.string('title', 255).notNullable();
    table.string('title_en', 255).defaultTo('');
    table.string('icon', 50).defaultTo('📚');
    table.text('description');
    table.text('description_en');
    table.integer('sort_order').defaultTo(0);
    table.tinyint('is_active').defaultTo(1);
    table.timestamps(true, true);
    table.index(['sort_order', 'is_active']);
  });

  // 4. scenarios
  await knex.schema.createTable('scenarios', (table) => {
    table.string('id', 64).primary();
    table.string('title', 255).notNullable();
    table.string('title_en', 255).notNullable();
    table.text('description');
    table.text('description_en');
    table.string('difficulty', 50).defaultTo('beginner');
    table.string('icon', 50).defaultTo('💬');
    table.text('tags'); // Store JSON array
    table.integer('sort_order').defaultTo(0);
    table.integer('max_turns').defaultTo(10);
    table.string('scene_type', 50).notNullable().defaultTo('level');
    table.string('category_id', 64);
    table.tinyint('is_featured').notNullable().defaultTo(0);
    table.tinyint('is_active').defaultTo(1);
    table.timestamps(true, true);
    table.index(['scene_type', 'category_id', 'sort_order']);
  });

  // 5. scenario_subtasks
  await knex.schema.createTable('scenario_subtasks', (table) => {
    table.string('id', 64).primary();
    table.string('scenario_id', 64).notNullable().references('id').inTable('scenarios');
    table.string('task_key', 100).notNullable();
    table.string('title', 255).notNullable();
    table.text('description');
    table.text('prompt_hint');
    table.integer('sort_order').defaultTo(0);
    table.tinyint('is_active').defaultTo(1);
    table.timestamps(true, true);
    table.unique(['scenario_id', 'task_key']);
    table.index(['scenario_id', 'sort_order', 'is_active']);
  });

  // 6. scenario_configs
  await knex.schema.createTable('scenario_configs', (table) => {
    table.increments('id').primary();
    table.string('scenario_id', 64).notNullable().references('id').inTable('scenarios');
    table.string('config_key', 100).notNullable();
    table.text('config_value').notNullable();
    table.unique(['scenario_id', 'config_key']);
  });

  // 7. user_scenarios
  await knex.schema.createTable('user_scenarios', (table) => {
    table.increments('id').primary();
    table.string('user_id', 64).notNullable().references('id').inTable('users');
    table.string('scenario_id', 64).notNullable().references('id').inTable('scenarios');
    table.tinyint('del').notNullable().defaultTo(0);
    table.datetime('deleted_at');
    table.timestamps(true, true);
    table.unique(['user_id', 'scenario_id']);
    table.index(['user_id', 'created_at']);
  });

  // 8. admin_ai_prompts
  await knex.schema.createTable('admin_ai_prompts', (table) => {
    table.string('id', 64).primary();
    table.string('prompt_code', 255).notNullable().unique();
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('layer_code', 100).notNullable();
    table.string('feature', 100).notNullable().defaultTo('');
    table.string('sub_feature_code', 100).notNullable().defaultTo('');
    table.string('flow_code', 100).notNullable().defaultTo('');
    table.string('target_id', 100).notNullable().defaultTo('');
    table.string('category_key', 100).notNullable().defaultTo('');
    table.string('source_ref', 255).notNullable().defaultTo('');
    table.text('content').notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.tinyint('is_builtin').notNullable().defaultTo(0);
    table.tinyint('is_active').notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.index(['layer_code', 'feature', 'sub_feature_code', 'flow_code', 'target_id', 'is_active', 'sort_order'], 'idx_prompts_lookup');
  });

  // 9. admin_prompt_bindings
  await knex.schema.createTable('admin_prompt_bindings', (table) => {
    table.increments('id').primary();
    table.string('owner_type', 100).notNullable();
    table.string('owner_id', 100).notNullable().defaultTo('default');
    table.string('feature', 100).notNullable().defaultTo('');
    table.string('sub_feature_code', 100).notNullable().defaultTo('');
    table.string('flow_code', 100).notNullable().defaultTo('');
    table.string('layer_code', 100).notNullable();
    table.string('prompt_id', 64).notNullable().references('id').inTable('admin_ai_prompts');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.tinyint('is_active').notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.unique(['owner_type', 'owner_id', 'feature', 'sub_feature_code', 'flow_code', 'layer_code', 'prompt_id'], 'idx_bindings_unique');
    table.index(['owner_type', 'owner_id', 'layer_code', 'feature', 'sub_feature_code', 'flow_code', 'is_active', 'sort_order'], 'idx_bindings_lookup');
  });

  // 10. admin_ai_model_configs
  await knex.schema.createTable('admin_ai_model_configs', (table) => {
    table.string('function_code', 100).primary();
    table.string('provider', 100).notNullable();
    table.string('model', 100).notNullable();
    table.string('base_url', 255).notNullable().defaultTo('');
    table.timestamps(true, true);
    table.index(['provider', 'updated_at']);
  });

  // 11. conversation_sessions
  await knex.schema.createTable('conversation_sessions', (table) => {
    table.string('id', 64).primary();
    table.string('scenario_id', 64).notNullable().references('id').inTable('scenarios');
    table.string('sub_task_id', 64);
    table.string('user_id', 64).defaultTo('default');
    table.string('status', 50).defaultTo('active');
    table.integer('current_turn').defaultTo(0);
    table.integer('max_turns').defaultTo(10);
    table.datetime('started_at').defaultTo(knex.fn.now());
    table.datetime('completed_at');
    table.text('summary');
    table.tinyint('del').notNullable().defaultTo(0);
    table.datetime('deleted_at');
    table.index(['user_id']);
    table.index(['user_id', 'scenario_id', 'del', 'started_at'], 'idx_sessions_user_scenario_del');
    table.index(['user_id', 'scenario_id', 'sub_task_id', 'del', 'started_at'], 'idx_sessions_user_scenario_subtask_del');
  });

  // 12. conversation_messages
  await knex.schema.createTable('conversation_messages', (table) => {
    table.increments('id').primary();
    table.string('session_id', 64).notNullable().references('id').inTable('conversation_sessions');
    table.integer('turn_number').notNullable();
    table.string('role', 50).notNullable();
    table.text('english').notNullable();
    table.text('chinese').notNullable();
    table.text('voice_url');
    table.float('voice_duration');
    table.text('raw_ai_response');
    table.string('user_input_type', 50).defaultTo('typed');
    table.tinyint('is_correct');
    table.text('ai_feedback');
    table.text('ai_explanation');
    table.text('user_hint');
    table.text('user_hint_cn');
    table.text('user_hint_idea');
    table.text('user_hint_idea_cn');
    table.text('user_hint_example');
    table.text('user_hint_example_cn');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.tinyint('del').notNullable().defaultTo(0);
    table.datetime('deleted_at');
    table.index(['session_id', 'del', 'turn_number']);
  });

  // 13. voice_assets
  await knex.schema.createTable('voice_assets', (table) => {
    table.increments('id').primary();
    table.string('cache_key', 255).notNullable().unique();
    table.text('text').notNullable();
    table.string('voice', 50).notNullable().defaultTo('alloy');
    table.float('speed').notNullable().defaultTo(1.0);
    table.string('provider', 100);
    table.string('model', 100);
    table.string('status', 50).notNullable().defaultTo('pending');
    table.text('url');
    table.text('error_message');
    table.datetime('last_accessed_at');
    table.timestamps(true, true);
  });

  // 14. word_bookmarks
  await knex.schema.createTable('word_bookmarks', (table) => {
    table.increments('id').primary();
    table.string('word', 255).notNullable();
    table.string('phonetic', 255);
    table.text('part_of_speech');
    table.text('definition_cn');
    table.text('definition_en');
    table.text('example_sentence');
    table.string('word_root', 255);
    table.string('source_scenario_id', 64);
    table.text('source_sentence');
    table.string('user_id', 64).defaultTo('default');
    table.text('tags');
    table.integer('review_count').defaultTo(0);
    table.datetime('last_reviewed_at');
    table.string('status', 50).notNullable().defaultTo('active');
    table.datetime('practiced_at');
    table.datetime('deleted_at');
    table.timestamps(true, true);
    table.unique(['user_id', 'word']);
    table.index(['user_id']);
  });

  // 15. word_click_logs
  await knex.schema.createTable('word_click_logs', (table) => {
    table.increments('id').primary();
    table.string('word', 255).notNullable();
    table.string('user_id', 64).defaultTo('default');
    table.string('session_id', 64);
    table.string('scenario_id', 64);
    table.text('context');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.index(['user_id']);
  });

  // 16. translation_cache
  await knex.schema.createTable('translation_cache', (table) => {
    table.increments('id').primary();
    table.string('provider', 100).notNullable();
    table.string('source_text', 500).notNullable(); // Max 500 to fit in MySQL 3072 bytes limit for index with utf8mb4
    table.string('trans_type', 50).notNullable();
    table.text('target_text').notNullable();
    table.text('raw_response');
    table.timestamps(true, true);
    table.unique(['provider', 'source_text', 'trans_type'], 'idx_trans_unique');
  });

  // 17. word_dictionary_entries
  await knex.schema.createTable('word_dictionary_entries', (table) => {
    table.increments('id').primary();
    table.string('word', 255).notNullable().unique();
    table.string('provider', 100).notNullable().defaultTo('local');
    table.string('language', 50).notNullable().defaultTo('en');
    table.string('native_language', 50).notNullable().defaultTo('zh-CN');
    table.string('phonetic', 255);
    table.text('part_of_speech');
    table.text('definition_cn');
    table.text('definition_en');
    table.text('example_sentences');
    table.text('usage_notes');
    table.text('synonyms');
    table.string('word_root', 255);
    table.text('raw_payload');
    table.timestamps(true, true);
  });

  // 18. user_settings
  await knex.schema.createTable('user_settings', (table) => {
    table.string('user_id', 64).primary();
    table.text('settings').notNullable();
    table.datetime('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const tables = [
    'user_settings',
    'word_dictionary_entries',
    'translation_cache',
    'word_click_logs',
    'word_bookmarks',
    'voice_assets',
    'conversation_messages',
    'conversation_sessions',
    'admin_ai_model_configs',
    'admin_prompt_bindings',
    'admin_ai_prompts',
    'user_scenarios',
    'scenario_configs',
    'scenario_subtasks',
    'scenarios',
    'scenario_categories',
    'admin_users',
    'users'
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};