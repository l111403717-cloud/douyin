# SQLite `user_info` 时间字段兼容迁移设计

## 问题

旧版 SQLite 数据库的 `user_info` 表没有 `created_at` 和 `updated_at`。启动时，`ensure_core_tables()` 使用 `ALTER TABLE ... ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP` 补列，但 SQLite 不允许 `ALTER TABLE` 添加带非常量默认值的列，因此应用启动失败。

## 方案

仅调整旧表升级路径，不改变新建数据库的建表语义：

1. 对缺失的普通账号字段继续按现有定义添加。
2. 对缺失的 `created_at`、`updated_at`，使用不带动态默认值的 `DATETIME` 定义添加。
3. 添加完成后，用 `CURRENT_TIMESTAMP` 回填现有记录中的空时间值。
4. 保持迁移幂等，重复调用 `ensure_core_tables()` 不报错且不覆盖已有时间。

现有账号仓储在新增和关键更新路径中显式写入时间；仍未显式写时间的旧调用可保留空值，不影响启动和账号使用。本修复不重建表、不删除数据，也不引入触发器。

## 测试

新增一个面向公共入口 `ensure_core_tables(db_path)` 的回归测试：

- 先创建旧版 `user_info` 表并插入一条账号记录。
- 执行升级后，断言两个时间列存在且旧记录已被回填。
- 再次执行升级，断言无异常且已有时间不被覆盖。

## 风险控制

避免重建 `user_info` 表，因此不会改变现有主键、索引或账号数据。测试使用临时 SQLite 文件，不接触用户的真实数据库。
