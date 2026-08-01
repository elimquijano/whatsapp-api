import assert from "node:assert/strict";
import test from "node:test";
import { Op } from "sequelize";
import { campaignAudienceWhere, normalizeCampaignAudienceFilters } from "./campaignAudience.js";

test("normalizes campaign name filters without allowing unbounded terms", () => {
  const filters = normalizeCampaignAudienceFilters({
    statuses: ["customer", "invalid", "customer"],
    nameTerms: " restaurante, mercado\nRestobar ",
    nameMatchMode: "all",
  });
  assert.deepEqual(filters, {
    statuses: ["customer"],
    nameTerms: ["restaurante", "mercado", "Restobar"],
    nameMatchMode: "all",
  });
});

test("builds any-name matching as a grouped OR and escapes SQL wildcards", () => {
  const { where, filters } = campaignAudienceWhere(8, { nameTerms: ["mercado", "50%_off"] });
  assert.equal(where.whatsappSessionId, 8);
  assert.equal(filters.nameMatchMode, "any");
  const alternatives = where[Op.and][0][Op.or];
  assert.equal(alternatives.length, 2);
  assert.equal(alternatives[0].name[Op.like], "%mercado%");
  assert.equal(alternatives[1].name[Op.like], "%50\\%\\_off%");
});

