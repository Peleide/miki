import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { db } from "./db";
import { User, UserRole } from "../types";

// Définition de l'outil pour Gemini
const getCheckInsTool: FunctionDeclaration = {
  name: "getCheckIns",
  description: "Récupère les données historiques des passages et nettoyages pour une salle ou une période donnée.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      equipmentId: {
        type: Type.STRING,
        description: "L'identifiant de la salle (ex: 'r1').",
      },
      date: {
        type: Type.STRING,
        description: "La date au format YYYY-MM-DD.",
      },
    },
  },
};

export class MikiAIService {
  private user: User;

  constructor(user: User) {
    this.user = user;
  }

  async sendMessage(history: any[], message: string) {
    // Recommendation: Create instance right before API call to ensure current context
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const modelName = "gemini-3-flash-preview"; 
    
    const systemInstruction = `
      Tu es l'intelligence artificielle de MIKI, assistant expert en gestion de nettoyage et maintenance multi-tenant.
      
      CONTEXTE DE L'UTILISATEUR :
      - Nom : ${this.user.firstName} ${this.user.lastName}
      - Rôle : ${this.user.role}
      - Tenant ID : ${this.user.tenantId}
      
      POLITIQUE DE CONFIDENTIALITÉ CRITIQUE :
      - Si le rôle est CLIENT (${UserRole.CLIENT}), tu dois ANONYMISER les agents. Ne cite JAMAIS de noms de famille. Dis "Un agent" ou "L'équipe d'entretien".
      - Ne donne jamais d'informations sur d'autres Tenants que "${this.user.tenantId}".
      
      CONSIGNES :
      - Réponds en Français de manière concise et professionnelle.
      - Utilise l'outil 'getCheckIns' pour fournir des chiffres exacts.
      - Si on te demande "qui a fait quoi", base-toi uniquement sur les snapshots de pointage.
      - Aujourd'hui : ${new Date().toLocaleDateString('fr-FR')}.
    `;

    try {
      const chat = ai.chats.create({
        model: modelName,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [getCheckInsTool] }],
        }
      });

      // chat.sendMessage only accepts the message parameter
      const result = await chat.sendMessage({ message });
      let textResponse = result.text || "";

      // Gestion des appels de fonctions (Tools)
      if (result.functionCalls && result.functionCalls.length > 0) {
        const call = result.functionCalls[0];
        
        if (call.name === "getCheckIns") {
          const args = call.args as any;
          const data = await db.getEquipmentLogsForAI(this.user.tenantId, this.user.role, {
            equipmentId: args.equipmentId,
            date: args.date
          });

          // Envoi de la réponse de l'outil au modèle
          // chat.sendMessage parameter is an object with a 'message' key
          const finalResult = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: "getCheckIns",
                  id: call.id,
                  response: { result: data }
                }
              }
            ]
          });
          textResponse = finalResult.text || "Analyse terminée.";
        }
      }

      return textResponse;

    } catch (error) {
      console.error("Gemini AI Error:", error);
      return "Désolé, une erreur technique m'empêche d'analyser ces données actuellement.";
    }
  }
}
