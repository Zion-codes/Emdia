import * as SQLite from "expo-sqlite";

export interface Migration {
  readonly version: number;
  readonly name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}
