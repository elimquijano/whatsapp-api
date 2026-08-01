import { Op } from "sequelize";

const ALLOWED_STATUSES = new Set(["new", "interested", "urgent", "follow_up", "customer", "not_interested"]);

export const normalizeCampaignAudienceFilters = (filters = {}) => {
  const statuses = Array.isArray(filters.statuses)
    ? [...new Set(filters.statuses.map((value) => String(value || "").trim()).filter((value) => ALLOWED_STATUSES.has(value)))]
    : [];
  const rawTerms = Array.isArray(filters.nameTerms)
    ? filters.nameTerms
    : String(filters.nameTerms || "").split(/[,\n]+/);
  const nameTerms = [...new Set(rawTerms
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 80))
    .filter(Boolean))].slice(0, 12);
  return {
    statuses,
    nameTerms,
    nameMatchMode: filters.nameMatchMode === "all" ? "all" : "any",
  };
};

const escapedLikeTerm = (value) => value.replace(/[\\%_]/g, "\\$&");

export const campaignAudienceWhere = (whatsappSessionId, rawFilters = {}, contactIds = []) => {
  const filters = normalizeCampaignAudienceFilters(rawFilters);
  const where = { whatsappSessionId };
  if (filters.statuses.length) where.status = { [Op.in]: filters.statuses };
  if (Array.isArray(contactIds) && contactIds.length) where.id = { [Op.in]: contactIds };
  if (filters.nameTerms.length) {
    const clauses = filters.nameTerms.map((term) => ({ name: { [Op.like]: `%${escapedLikeTerm(term)}%` } }));
    where[Op.and] = filters.nameMatchMode === "all" ? clauses : [{ [Op.or]: clauses }];
  }
  return { where, filters };
};

