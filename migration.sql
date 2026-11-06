-- Audit log is append-only: block UPDATE/DELETE at the database level.
CREATE OR REPLACE FUNCTION acaflow_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION acaflow_audit_append_only();

-- Approval actions are append-only as well.
CREATE TRIGGER approval_action_no_update BEFORE UPDATE OR DELETE ON "ApprovalAction"
  FOR EACH ROW EXECUTE FUNCTION acaflow_audit_append_only();

-- Published payloads are immutable.
CREATE OR REPLACE FUNCTION acaflow_publication_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."payloadHash" <> OLD."payloadHash" OR NEW.payload::text <> OLD.payload::text THEN
    RAISE EXCEPTION 'Publication payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER publication_immutable BEFORE UPDATE OR DELETE ON "Publication"
  FOR EACH ROW EXECUTE FUNCTION acaflow_publication_immutable();

-- At most one PUBLISHED schedule version per tenant + term (supersede explicitly).
CREATE UNIQUE INDEX schedule_version_one_published ON "ScheduleVersion"("tenantId", "termId") WHERE status = 'PUBLISHED';

-- Capacity sanity.
ALTER TABLE "Room" ADD CONSTRAINT room_capacity_bounds CHECK ("approvedMaximumCapacity" >= "nominalCapacity" AND "nominalCapacity" > 0);
ALTER TABLE "TimeSlot" ADD CONSTRAINT timeslot_interval CHECK ("endMin" > "startMin");
ALTER TABLE "TravelTime" ADD CONSTRAINT travel_non_negative CHECK (minutes >= 0);
