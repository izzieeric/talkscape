class Scenario {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.titleEn = data.title_en;
    this.description = data.description;
    this.descriptionEn = data.description_en;
    this.difficulty = data.difficulty || 'beginner';
    this.icon = data.icon || '💬';
    this.tags = JSON.parse(data.tags || '[]');
    this.sceneType = data.scene_type || 'level';
    this.categoryId = data.category_id || '';
    this.isFeatured = Number(data.is_featured || 0) === 1;
    this.sortOrder = data.sort_order || 0;
    this.maxTurns = data.max_turns || 10;
    this.isActive = data.is_active === 1;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static fromDbRow(row) {
    return new Scenario(row);
  }
}

module.exports = Scenario;
