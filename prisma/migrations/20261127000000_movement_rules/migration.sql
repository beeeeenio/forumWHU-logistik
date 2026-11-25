-- Domänenregeln auch in der Datenbank durchsetzen (zusätzlich zur Anwendung): Form jeder Buchungsart, Storno-Grund, Plan-Quelle ≠ Ziel
-- und Unveränderlichkeit: Bewegungen dürfen nachträglich nur storniert werden (Storno-Spalten), nie inhaltlich geändert.
ALTER TABLE "movements" ADD CONSTRAINT "movements_kind_shape" CHECK (
  CASE "kind"
    WHEN 'RECEIPT'   THEN "from_location_id" IS NULL AND "to_location_id" IS NOT NULL AND "to_state" = 'FULL'
    WHEN 'TRANSFER'  THEN "from_location_id" IS NOT NULL AND "to_location_id" IS NOT NULL AND "from_state" = "to_state" AND "from_location_id" <> "to_location_id"
    WHEN 'CONSUME'   THEN "from_location_id" IS NOT NULL AND "from_state" = 'FULL' AND ("to_location_id" IS NULL OR ("to_state" = 'EMPTY' AND "to_location_id" = "from_location_id"))
    WHEN 'RETURN'    THEN "from_location_id" IS NOT NULL AND "from_state" = 'EMPTY' AND "to_location_id" IS NULL
    WHEN 'WRITE_OFF' THEN "from_location_id" IS NOT NULL AND "to_location_id" IS NULL
    WHEN 'ADJUST'    THEN ("from_location_id" IS NULL) <> ("to_location_id" IS NULL)
    ELSE false
  END);
ALTER TABLE "movements" ADD CONSTRAINT "movements_void_reason" CHECK ("voided_at" IS NULL OR "void_reason" IS NOT NULL);
ALTER TABLE "plans" ADD CONSTRAINT "plans_from_ne_to" CHECK ("from_location_id" IS NULL OR "from_location_id" <> "to_location_id");

CREATE FUNCTION movements_protect() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."article_id" IS DISTINCT FROM OLD."article_id" OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
     OR NEW."from_location_id" IS DISTINCT FROM OLD."from_location_id" OR NEW."from_state" IS DISTINCT FROM OLD."from_state"
     OR NEW."to_location_id" IS DISTINCT FROM OLD."to_location_id" OR NEW."to_state" IS DISTINCT FROM OLD."to_state"
     OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at" OR NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id" THEN
    RAISE EXCEPTION 'Buchungen sind unveränderlich – bitte stornieren und neu erfassen' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."voided_at" IS NOT NULL AND (NEW."voided_at" IS DISTINCT FROM OLD."voided_at" OR NEW."void_reason" IS DISTINCT FROM OLD."void_reason") THEN
    RAISE EXCEPTION 'Eine stornierte Buchung bleibt storniert' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER "movements_protect" BEFORE UPDATE ON "movements" FOR EACH ROW EXECUTE FUNCTION movements_protect();
