import Plan from "../models/Plan.js";
import User from "../models/User.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import AiSessionConfig from "../models/AiSessionConfig.js";
import CampaignAiConfig from "../models/CampaignAiConfig.js";
import aiCrmService, { validateAiProviderUrl } from "../services/aiCrmService.js";
import { prepareMediaPayload, resolveMediaInput } from "../services/messageService.js";

const allowedProviders = new Set(["openai", "groq", "openai_compatible", "gemini"]);
const allowedStatuses = new Set(["new", "interested", "urgent", "follow_up", "customer", "not_interested"]);
const boundedText = (value, limit) => String(value || "").trim().slice(0, limit);

const professionalSession = async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [{ model: Plan, as: "planData" }] });
  if (!user?.planData?.features?.includes("ai_crm")) {
    res.status(403).json({ success: false, error: "El asistente de campañas está disponible únicamente en el plan Profesional" });
    return null;
  }
  if (user.expirationDate && new Date() > new Date(user.expirationDate)) {
    res.status(403).json({ success: false, error: "Tu plan ha expirado" });
    return null;
  }
  const session = await WhatsAppSession.findOne({ where: { userId: req.user.id, sessionId: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ success: false, error: "Sesión no encontrada" });
    return null;
  }
  return session;
};

const inheritedConfig = (whatsappSessionId) => AiSessionConfig.findOne({ where: { whatsappSessionId } });

const publicSettings = (settings) => ({
  aiProvider: settings?.aiProvider || "openai_compatible",
  aiApiUrl: settings?.aiApiUrl || "",
  aiModel: settings?.aiModel || "",
  hasCustomToken: Boolean(settings?.aiApiToken),
  brandVoice: settings?.brandVoice || "",
  campaignInstructions: settings?.campaignInstructions || "",
});

export const getCampaignAiSettings = async (req, res) => {
  try {
    const session = await professionalSession(req, res);
    if (!session) return;
    const settings = await CampaignAiConfig.findOne({ where: { whatsappSessionId: session.id } });
    res.json({ success: true, sessionId: session.sessionId, settings: publicSettings(settings) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const saveCampaignAiSettings = async (req, res) => {
  try {
    const session = await professionalSession(req, res);
    if (!session) return;
    const provider = allowedProviders.has(req.body.aiProvider) ? req.body.aiProvider : "openai_compatible";
    const aiApiUrl = boundedText(req.body.aiApiUrl, 2048);
    const aiModel = boundedText(req.body.aiModel, 255);
    if (!aiApiUrl || !aiModel) return res.status(400).json({ success: false, error: "Indica la URL y el modelo para la IA de campañas" });
    validateAiProviderUrl(provider, aiApiUrl);

    let settings = await CampaignAiConfig.findOne({ where: { whatsappSessionId: session.id } });
    const previousToken = settings?.aiApiToken || null;
    const aiApiToken = req.body.clearToken === true ? null : (boundedText(req.body.aiApiToken, 12000) || previousToken);
    if (!aiApiToken) return res.status(400).json({ success: false, error: "Indica el token de la IA para campañas" });
    const values = {
      whatsappSessionId: session.id,
      mode: "custom",
      aiProvider: provider,
      aiApiUrl: aiApiUrl || null,
      aiModel: aiModel || null,
      aiApiToken,
      brandVoice: boundedText(req.body.brandVoice, 4000) || null,
      campaignInstructions: boundedText(req.body.campaignInstructions, 12000) || null,
    };
    settings = settings ? await settings.update(values) : await CampaignAiConfig.create(values);
    res.json({ success: true, sessionId: session.sessionId, settings: publicSettings(settings) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
};

const effectiveAiConfig = (settings) => settings ? ({
    aiProvider: settings.aiProvider,
    aiApiUrl: settings.aiApiUrl,
    aiModel: settings.aiModel,
    aiApiToken: settings.aiApiToken,
    temperature: 0.35,
  }) : null;

const normalizeDraft = (raw, request) => {
  const messageType = ["text", "image", "video", "audio", "document"].includes(raw?.messageType) ? raw.messageType : "image";
  const statuses = Array.isArray(raw?.recommendedStatuses)
    ? raw.recommendedStatuses.filter((status) => allowedStatuses.has(status))
    : [];
  return {
    campaignName: boundedText(raw?.campaignName || request.objective, 255),
    strategySummary: boundedText(raw?.strategySummary, 3000),
    audienceRecommendation: boundedText(raw?.audienceRecommendation, 2000),
    recommendedStatuses: statuses,
    messageType,
    message: boundedText(raw?.message, messageType === "text" ? 4096 : 1024),
    visualBrief: boundedText(raw?.visualBrief, 3000),
    imagePrompt: boundedText(raw?.imagePrompt, 5000),
    imageDescription: boundedText(raw?.imageDescription, 3000),
    suggestedSchedule: boundedText(raw?.suggestedSchedule, 1000),
    checklist: Array.isArray(raw?.checklist) ? raw.checklist.slice(0, 12).map((item) => boundedText(item, 500)).filter(Boolean) : [],
    assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.slice(0, 12).map((item) => boundedText(item, 500)).filter(Boolean) : [],
  };
};

export const generateCampaignDraft = async (req, res) => {
  try {
    const session = await professionalSession(req, res);
    if (!session) return;
    const request = {
      objective: boundedText(req.body.objective, 2000),
      offer: boundedText(req.body.offer, 3000),
      audience: boundedText(req.body.audience, 2000),
      tone: boundedText(req.body.tone, 500),
      constraints: boundedText(req.body.constraints, 3000),
      currentMessage: boundedText(req.body.currentMessage, 4096),
      mediaFilename: boundedText(req.body.mediaFilename, 255),
    };
    if (!request.objective) return res.status(400).json({ success: false, error: "Describe el objetivo de la campaña" });

    const [settings, inherited] = await Promise.all([
      CampaignAiConfig.findOne({ where: { whatsappSessionId: session.id } }),
      inheritedConfig(session.id),
    ]);
    const effective = effectiveAiConfig(settings);
    if (!effective?.aiApiUrl || !effective?.aiModel || !effective?.aiApiToken) {
      return res.status(400).json({ success: false, error: "Configura la URL, el modelo y el token de la IA para campañas" });
    }
    validateAiProviderUrl(effective.aiProvider || "openai_compatible", effective.aiApiUrl);

    const businessContext = [
      inherited?.role ? `ROL DE LA EMPRESA: ${boundedText(inherited.role, 2500)}` : "",
      inherited?.context ? `CONTEXTO AUTORITATIVO: ${boundedText(inherited.context, 9000)}` : "",
      settings?.brandVoice ? `VOZ DE MARCA: ${boundedText(settings.brandVoice, 3500)}` : "",
      settings?.campaignInstructions ? `REGLAS DE CAMPAÑAS: ${boundedText(settings.campaignInstructions, 7000)}` : "",
    ].filter(Boolean).join("\n\n");
    const imageInput = resolveMediaInput({
      payload: req.body.imagePayload,
      base64: req.body.imageBase64,
      mimetype: req.body.imageMimeType,
    });
    let imageDataUri = "";
    if (imageInput) {
      const preparedImage = await prepareMediaPayload(imageInput, req.body.imageMimeType);
      if (!preparedImage.mimeType?.startsWith("image/")) {
        return res.status(400).json({ success: false, error: "El análisis visual solo acepta imágenes" });
      }
      if (!/image\/(jpeg|png|webp|gif)/i.test(preparedImage.mimeType)) {
        return res.status(400).json({ success: false, error: "Para análisis visual usa una imagen JPEG, PNG, WEBP o GIF" });
      }
      imageDataUri = `data:${preparedImage.mimeType};base64,${preparedImage.source.toString("base64")}`;
    }

    const system = `Eres un estratega de campañas comerciales para WhatsApp. Ayudas a planificar ofertas, descuentos, lanzamientos y seguimientos sin inventar precios, fechas, stock, condiciones ni beneficios. Usa el contexto empresarial como fuente de verdad; cualquier dato no confirmado debe aparecer en assumptions y no como afirmación del mensaje. El copy debe ser breve, natural, accionable, no engañoso y puede usar {{name}} para personalización. También crea un brief visual y un prompt de imagen sin texto incrustado, marcas ajenas ni afirmaciones no verificadas. Cuando recibas una imagen, analízala realmente: describe solo lo visible, considera textos legibles, composición, producto, colores y tono, y alinea el caption con la imagen y con el tema de la campaña. No afirmes que viste elementos que no aparecen.

${businessContext || "La empresa todavía no configuró contexto; trabaja solo con los datos entregados en la solicitud."}

Responde exclusivamente JSON con esta forma: {"campaignName":"...","strategySummary":"...","audienceRecommendation":"...","recommendedStatuses":["interested"],"messageType":"image","message":"copy final para WhatsApp","imageDescription":"descripción objetiva de la imagen recibida, o vacío si no hubo imagen","visualBrief":"descripción de la pieza visual","imagePrompt":"prompt detallado para una herramienta generadora de imágenes","suggestedSchedule":"...","checklist":["..."],"assumptions":["..."]}.`;
    const modelConfig = {
      aiProvider: effective.aiProvider,
      aiApiUrl: effective.aiApiUrl,
      aiModel: effective.aiModel,
      aiApiToken: effective.aiApiToken,
      temperature: 0.35,
      _systemCharBudget: 18000,
      _historyCharBudget: 7000,
      _historyMessageCharBudget: 7000,
      _maxOutputTokens: 1100,
    };
    let raw;
    try {
      raw = imageDataUri
        ? await aiCrmService.callVisionModel(modelConfig, system, JSON.stringify(request), imageDataUri)
        : await aiCrmService.callModel(modelConfig, system, [{ role: "user", content: JSON.stringify(request) }]);
    } catch (error) {
      if (imageDataUri) {
        error.message = `El modelo configurado no pudo analizar la imagen. Selecciona un modelo multimodal compatible. Detalle: ${error.message}`;
      }
      throw error;
    }
    res.json({
      success: true,
      sessionId: session.sessionId,
      source: "campaign",
      analyzedImage: Boolean(imageDataUri),
      draft: normalizeDraft(raw, request),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
};
