export const BODY_PART_REFERENCE = {
  upperBody: ["Chest", "Back", "Shoulders (Front, Mid, Rear)", "Biceps", "Triceps", "Forearms"],
  lowerBody: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Lower Back"],
  core: ["Abs", "Obliques", "Core Stability"],
};

export const GYM_TRAINING_SPLITS = {
  "3_day": {
    full_body: [
      { day: 1, name: "Full Body - Push Focus", targets: ["Chest", "Shoulders", "Triceps", "Forearms", "Core"] },
      { day: 2, name: "Full Body - Pull Focus", targets: ["Back", "Biceps", "Rear Deltoids", "Forearms", "Core"] },
      { day: 3, name: "Full Body - Lower Focus", targets: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Core"] },
    ],
    female_priority_glutes_thighs: [
      { day: 1, name: "Glutes & Hamstrings", targets: ["Glutes (Primary)", "Hamstrings", "Lower Back", "Calves", "Core/Abs"] },
      { day: 2, name: "Upper Body + Chest", targets: ["Chest (Primary)", "Back", "Shoulders", "Biceps", "Forearms"] },
      { day: 3, name: "Thighs & Abs", targets: ["Quadriceps (Primary)", "Glutes (Secondary)", "Core/Abs (Primary)", "Calves"] },
    ],
    male_priority_strength: [
      { day: 1, name: "Chest, Shoulders, Triceps", targets: ["Chest (Primary)", "Shoulders", "Triceps", "Forearms", "Core"] },
      { day: 2, name: "Back, Biceps", targets: ["Back (Primary)", "Biceps", "Rear Deltoids", "Forearms", "Core"] },
      { day: 3, name: "Legs", targets: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Core"] },
    ],
  },
  "4_day": {
    upper_body_priority: [
      { day: 1, name: "Upper Push - Chest, Shoulders, Triceps", targets: ["Chest (Primary)", "Shoulders (Primary)", "Triceps", "Forearms"] },
      { day: 2, name: "Upper Pull - Back, Biceps, Rear Deltoids", targets: ["Back (Primary)", "Biceps (Primary)", "Rear Deltoids", "Forearms", "Core/Abs"] },
      { day: 3, name: "Lower Body - Maintenance", targets: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Core/Abs"] },
      { day: 4, name: "Upper Hypertrophy - Shoulders, Arms, Chest/Back Support", targets: ["Shoulders (Primary)", "Biceps", "Triceps", "Chest (Secondary)", "Back (Secondary)", "Forearms", "Core/Abs"] },
    ],
    upper_lower: [
      { day: 1, name: "Upper Body Push", targets: ["Chest", "Shoulders (Front & Mid)", "Triceps", "Forearms"] },
      { day: 2, name: "Lower Body", targets: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Core"] },
      { day: 3, name: "Upper Body Pull", targets: ["Back", "Rear Deltoids", "Biceps", "Forearms"] },
      { day: 4, name: "Lower Body Variation", targets: ["Hamstrings (Primary)", "Glutes (Primary)", "Quadriceps (Secondary)", "Calves", "Core"] },
    ],
    female_priority_glutes_thighs_upper: [
      { day: 1, name: "Glutes & Hamstrings Focus", targets: ["Glutes (Primary)", "Hamstrings (Primary)", "Lower Back", "Calves"] },
      { day: 2, name: "Upper Body Pull + Biceps", targets: ["Back", "Biceps", "Rear Deltoids", "Forearms", "Core"] },
      { day: 3, name: "Quadriceps & Thighs", targets: ["Quadriceps (Primary)", "Glutes (Secondary)", "Hamstrings (Secondary)", "Calves", "Core/Abs"] },
      { day: 4, name: "Upper Body Push + Chest", targets: ["Chest (Primary)", "Shoulders", "Triceps", "Forearms", "Core/Abs"] },
    ],
    male_priority_upper_strength: [
      { day: 1, name: "Upper Push", targets: ["Chest", "Front Shoulders", "Triceps", "Forearms"] },
      { day: 2, name: "Upper Pull", targets: ["Back", "Rear Shoulders", "Biceps", "Forearms"] },
      { day: 3, name: "Lower Body - Maintenance", targets: ["Quadriceps", "Hamstrings", "Glutes", "Calves", "Core"] },
      { day: 4, name: "Shoulders, Arms & Upper Accessories", targets: ["Shoulders", "Biceps", "Triceps", "Chest (Secondary)", "Back (Secondary)", "Forearms", "Core"] },
    ],
  },
  "5_day": {
    push_pull_legs: [
      { day: 1, name: "Push", targets: ["Chest", "Shoulders (Front & Mid)", "Triceps", "Forearms"] },
      { day: 2, name: "Pull", targets: ["Back", "Rear Deltoids", "Biceps", "Forearms"] },
      { day: 3, name: "Legs - Quad Focus", targets: ["Quadriceps (Primary)", "Glutes", "Calves", "Core"] },
      { day: 4, name: "Push Variation", targets: ["Shoulders", "Chest (Secondary)", "Triceps", "Forearms"] },
      { day: 5, name: "Pull/Legs", targets: ["Back", "Hamstrings", "Glutes", "Biceps", "Calves"] },
    ],
    female_priority_glutes_thighs_abs_chest: [
      { day: 1, name: "Glutes & Hamstrings - Heavy", targets: ["Glutes (Primary)", "Hamstrings (Primary)", "Lower Back", "Calves"] },
      { day: 2, name: "Chest & Upper Push", targets: ["Chest (Primary)", "Shoulders", "Triceps", "Forearms"] },
      { day: 3, name: "Quadriceps & Thighs", targets: ["Quadriceps (Primary)", "Glutes (Secondary)", "Calves", "Core/Abs"] },
      { day: 4, name: "Upper Pull & Back", targets: ["Back (Primary)", "Biceps", "Rear Deltoids", "Forearms", "Core"] },
      { day: 5, name: "Glutes, Core & Cardio", targets: ["Glutes (Secondary/Activation)", "Core/Abs (Primary)", "Hamstrings (Light)", "Calves"] },
    ],
    male_priority_strength_hypertrophy: [
      { day: 1, name: "Chest & Triceps", targets: ["Chest (Primary)", "Triceps (Primary)", "Shoulders (Front)", "Forearms"] },
      { day: 2, name: "Back & Biceps", targets: ["Back (Primary)", "Biceps (Primary)", "Rear Deltoids", "Forearms"] },
      { day: 3, name: "Legs - Quad Focus", targets: ["Quadriceps (Primary)", "Glutes", "Calves", "Core"] },
      { day: 4, name: "Shoulders & Arms", targets: ["Shoulders (All Three Heads)", "Triceps (Secondary)", "Biceps (Secondary)", "Forearms"] },
      { day: 5, name: "Legs - Hamstring/Glute Focus", targets: ["Hamstrings (Primary)", "Glutes (Primary)", "Lower Back", "Calves", "Core"] },
    ],
  },
  "6_day": {
    push_pull_legs: [
      { day: 1, name: "Push - Chest Focus", targets: ["Chest (Primary)", "Shoulders (Front & Mid)", "Triceps", "Forearms"] },
      { day: 2, name: "Pull - Back Focus", targets: ["Back (Primary)", "Rear Deltoids", "Biceps", "Forearms"] },
      { day: 3, name: "Legs - Quad Focus", targets: ["Quadriceps (Primary)", "Glutes", "Calves", "Core"] },
      { day: 4, name: "Push - Shoulder Focus", targets: ["Shoulders (All Heads)", "Chest (Secondary)", "Triceps", "Forearms"] },
      { day: 5, name: "Pull - Back/Bicep Focus", targets: ["Back (Secondary/Variation)", "Biceps (Primary)", "Rear Deltoids", "Forearms"] },
      { day: 6, name: "Legs - Hamstring/Glute Focus", targets: ["Hamstrings (Primary)", "Glutes (Primary)", "Lower Back", "Calves", "Core"] },
    ],
    female_priority_glutes_thighs_chest_abs: [
      { day: 1, name: "Glutes & Hamstrings - Heavy", targets: ["Glutes (Primary)", "Hamstrings (Primary)", "Lower Back", "Calves"] },
      { day: 2, name: "Chest & Upper Push", targets: ["Chest (Primary)", "Shoulders (Front & Mid)", "Triceps", "Forearms"] },
      { day: 3, name: "Quadriceps & Thighs", targets: ["Quadriceps (Primary)", "Glutes (Secondary)", "Calves", "Core/Abs"] },
      { day: 4, name: "Upper Pull & Back", targets: ["Back (Primary)", "Biceps", "Rear Deltoids", "Forearms"] },
      { day: 5, name: "Glutes & Hamstrings - Variation", targets: ["Glutes (Primary/Different Angle)", "Hamstrings (Secondary)", "Core/Abs (Primary)", "Calves"] },
      { day: 6, name: "Shoulders, Arms & Core", targets: ["Shoulders (All Heads)", "Triceps", "Biceps", "Forearms", "Core/Abs (Primary)"] },
    ],
    male_priority_strength_hypertrophy: [
      { day: 1, name: "Chest & Triceps", targets: ["Chest (Primary)", "Triceps (Primary)", "Shoulders (Front)", "Forearms"] },
      { day: 2, name: "Back & Biceps", targets: ["Back (Primary)", "Biceps (Primary)", "Rear Deltoids", "Forearms"] },
      { day: 3, name: "Legs - Quad Focus", targets: ["Quadriceps (Primary)", "Glutes", "Calves", "Core"] },
      { day: 4, name: "Shoulders & Chest - Variation", targets: ["Shoulders (All Three Heads)", "Chest (Secondary)", "Triceps (Secondary)", "Forearms"] },
      { day: 5, name: "Back & Hamstrings", targets: ["Back (Secondary/Variation)", "Hamstrings (Primary)", "Glutes", "Biceps (Secondary)", "Forearms"] },
      { day: 6, name: "Arms & Legs - Accessory", targets: ["Biceps (Focus)", "Triceps (Focus)", "Forearms (Focus)", "Hamstrings (Light)", "Glutes (Light)", "Calves", "Core"] },
    ],
  },
};
