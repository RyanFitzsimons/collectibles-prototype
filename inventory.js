// inventory.js : Defines validation rules for inventory items by category and exports a validation function.

// A detailed object (validationRules) specifying required/optional fields for categories
const validationRules = {
    "Pokémon": {
      attributes: { required: ["set", "series", "number", "rarity", "language"], optional: [] },
      condition: {
        required: ["type"],
        typeRules: {
          "Raw": { required: ["value"], optional: [] },
          "Graded": { required: ["value", "company"], optional: ["sub_grades"] }
        }
      }
    },
    "Video Games": {
      attributes: { required: ["platform", "region", "packaging"], optional: ["edition"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Loose": { required: [], optional: ["value", "components"] },
          "CIB": { required: ["value", "components"], optional: [] },
          "Sealed": { required: [], optional: ["value", "components"] }
        }
      }
    },
    "Comics": {
      attributes: { required: ["title", "issue", "publisher"], optional: ["variant", "year"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Raw": { required: ["value"], optional: [] },
          "Graded": { required: ["value", "company"], optional: ["sub_grades"] }
        }
      }
    },
    "Football Jerseys": {
      attributes: { required: ["team", "season", "size"], optional: ["player", "signed"] },
      condition: { required: ["value"], optional: ["tags"] }
    },
    "GAA Jerseys": {
      attributes: { required: ["county", "year", "size"], optional: ["player", "signed"] },
      condition: { required: ["value"], optional: ["tags"] }
    },
    "Coins": {
      attributes: { required: ["denomination", "year", "country"], optional: ["metal", "mint_mark"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Circulated": { required: ["value"], optional: [] },
          "Uncirculated": { required: ["value"], optional: ["company"] }
        }
      }
    },
    "Video Game Consoles": {
      attributes: { required: ["model", "region"], optional: ["edition", "serial_number"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Loose": { required: [], optional: ["value"] },
          "Boxed": { required: ["value", "components"], optional: [] }
        }
      }
    },
    "Electronics": {
      attributes: { required: ["type", "brand", "model"], optional: ["year"] },
      condition: { required: ["value"], optional: ["details"] }
    },
    "Other TCGs": {
      attributes: { required: ["game", "set", "number", "rarity"], optional: ["language"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Raw": { required: ["value"], optional: [] },
          "Graded": { required: ["value", "company"], optional: ["sub_grades"] }
        }
      }
    },
    "Sports Cards": {
      attributes: { required: ["sport", "player", "year", "brand"], optional: ["card_number"] },
      condition: {
        required: ["type"],
        typeRules: {
          "Raw": { required: ["value"], optional: [] },
          "Graded": { required: ["value", "company"], optional: ["sub_grades"] }
        }
      }
    }
  };
  
// Checks attributes, condition, and condition_history against category rules
function validateInventoryItem(item) {
    const rules = validationRules[item.category];
    if (!rules) throw new Error(`Unknown category: ${item.category}`);
  
    const attrRules = rules.attributes;
    const missingAttrs = attrRules.required.filter(key => !(key in item.attributes));
    if (missingAttrs.length > 0) throw new Error(`Missing required attributes: ${missingAttrs}`);
    const invalidAttrs = Object.keys(item.attributes).filter(
      key => !attrRules.required.includes(key) && !attrRules.optional.includes(key)
    );
    if (invalidAttrs.length > 0) throw new Error(`Invalid attributes: ${invalidAttrs}`);
  
    const condRules = rules.condition;
    const missingCond = condRules.required.filter(key => !(key in item.condition));
    if (missingCond.length > 0) throw new Error(`Missing required condition fields: ${missingCond}`);
    if ("type" in condRules.typeRules && !condRules.typeRules[item.condition.type]) {
      throw new Error(`Invalid condition type: ${item.condition.type}`);
    }
    if (condRules.typeRules) {
      const typeRules = condRules.typeRules[item.condition.type];
      const missingType = typeRules.required.filter(key => !(key in item.condition));
      if (missingType.length > 0) throw new Error(`Missing type-specific fields: ${missingType}`);
    }
  
    item.condition_history.forEach((entry, index) => {
      const histTypeRules = condRules.typeRules ? condRules.typeRules[entry.type] : condRules;
      if (condRules.typeRules && !histTypeRules) throw new Error(`Invalid history type at ${index}: ${entry.type}`);
      const missingHist = histTypeRules.required.filter(key => !(key in entry));
      if (missingHist.length > 0) throw new Error(`Missing history fields at ${index}: ${missingHist}`);
    });
  
    return true;
}
  
module.exports = { validateInventoryItem };