-- v69.8: Full UDC Taxonomy Expansion
-- Scientific basis: Universal Decimal Classification (UDC, 2024)
-- Expands knowledge_wisdom from 7 domains/27 rows to 10 domains/~70 rows
-- covering all branches of human knowledge per UDC main classes 0-9
-- Reference: UDC Consortium (2024), https://udcsummary.info/

-- ─── UDC Class 0: Generalities, Science & Knowledge ──────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('general_science', NULL, 25000, 'Ciência geral, epistemologia, teoria do conhecimento, ciência da informação'),
('general_science', 'epistemology', 3000, 'Epistemologia, teoria do conhecimento, filosofia da ciência'),
('general_science', 'information_science', 5000, 'Ciência da informação, biblioteconomia, documentação, metadados'),
('general_science', 'systems_theory', 4000, 'Teoria dos sistemas, cibernética, complexidade, emergência'),
('general_science', 'research_methods', 6000, 'Metodologia científica, estatística aplicada, meta-análise'),
('general_science', 'computer_science', 8000, 'Ciência da computação geral, teoria da computação, algoritmos');

-- ─── UDC Class 1: Philosophy & Psychology ────────────────────────────────────
-- philosophy already exists, add subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('philosophy', 'ethics', 3000, 'Ética, filosofia moral, metaética, ética aplicada'),
('philosophy', 'logic', 4000, 'Lógica formal, lógica matemática, lógica fuzzy, raciocínio'),
('philosophy', 'metaphysics', 2500, 'Metafísica, ontologia, filosofia da mente, realismo'),
('philosophy', 'epistemology_phil', 2000, 'Epistemologia filosófica, teoria do conhecimento, ceticismo'),
('philosophy', 'philosophy_of_ai', 2000, 'Filosofia da IA, consciência artificial, ética de IA');

-- ─── UDC Class 2: Religion & Theology ────────────────────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('humanities', NULL, 20000, 'Humanidades: religião, história, linguística, literatura, artes'),
('humanities', 'religion_theology', 5000, 'Religiões do mundo, teologia comparada, espiritualidade'),
('humanities', 'linguistics', 6000, 'Linguística, fonologia, semântica, pragmática, psicolinguística'),
('humanities', 'literature', 5000, 'Literatura comparada, análise literária, narratologia'),
('humanities', 'history', 6000, 'História mundial, historiografia, arqueologia, paleontologia'),
('humanities', 'arts_aesthetics', 4000, 'Estética, teoria das artes, história da arte, crítica');

-- ─── UDC Class 3: Social Sciences ────────────────────────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('social_sciences', NULL, 35000, 'Ciências sociais: sociologia, economia, direito, política, educação'),
('social_sciences', 'sociology', 7000, 'Sociologia, estrutura social, mobilidade, desigualdade'),
('social_sciences', 'economics', 8000, 'Economia macro e microeconômica, econometria, teoria dos jogos'),
('social_sciences', 'law', 6000, 'Direito, jurisprudência, direito internacional, regulação'),
('social_sciences', 'political_science', 5000, 'Ciência política, governança, democracia, geopolítica'),
('social_sciences', 'education', 5000, 'Pedagogia, ciências da educação, aprendizado, currículo'),
('social_sciences', 'anthropology', 4000, 'Antropologia cultural, etnografia, arqueologia social');

-- ─── UDC Class 4: Language & Linguistics (merged into Class 8 in modern UDC) ─
-- Already covered under humanities/linguistics above

-- ─── UDC Class 5: Natural Sciences ───────────────────────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('natural_sciences', NULL, 60000, 'Ciências naturais: física, química, biologia, astronomia, geociências'),
('natural_sciences', 'physics', 15000, 'Física clássica, quântica, relatividade, mecânica estatística'),
('natural_sciences', 'chemistry', 10000, 'Química geral, orgânica, inorgânica, físico-química, bioquímica'),
('natural_sciences', 'biology', 12000, 'Biologia celular, genética, evolução, ecologia, microbiologia'),
('natural_sciences', 'astronomy', 5000, 'Astronomia, astrofísica, cosmologia, exploração espacial'),
('natural_sciences', 'earth_sciences', 6000, 'Geologia, geofísica, oceanografia, meteorologia, climatologia'),
('natural_sciences', 'environmental_science', 5000, 'Ciências ambientais, mudanças climáticas, sustentabilidade');

-- ─── UDC Class 6: Technology & Applied Sciences ──────────────────────────────
-- software_engineering already exists, add more tech domains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('technology', NULL, 45000, 'Tecnologia aplicada: engenharia, medicina, agricultura, indústria'),
('technology', 'biomedical_engineering', 8000, 'Engenharia biomédica, dispositivos médicos, bioinformática'),
('technology', 'electrical_engineering', 7000, 'Engenharia elétrica, eletrônica, telecomunicações, IoT'),
('technology', 'mechanical_engineering', 6000, 'Engenharia mecânica, termodinâmica, robótica, manufatura'),
('technology', 'civil_engineering', 5000, 'Engenharia civil, estruturas, urbanismo, infraestrutura'),
('technology', 'materials_science', 5000, 'Ciência dos materiais, nanotecnologia, polímeros, semicondutores'),
('technology', 'energy_systems', 4000, 'Sistemas de energia, energias renováveis, armazenamento'),
('technology', 'agriculture_food', 4000, 'Agronomia, tecnologia de alimentos, biotecnologia agrícola');

-- ─── UDC Class 7: Arts & Recreation ─────────────────────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('arts_recreation', NULL, 18000, 'Artes, música, esportes, entretenimento, design'),
('arts_recreation', 'visual_arts', 4000, 'Artes visuais, pintura, escultura, fotografia, cinema'),
('arts_recreation', 'music', 4000, 'Teoria musical, composição, musicologia, produção musical'),
('arts_recreation', 'design_ux', 5000, 'Design, UX/UI, design de interação, design thinking, HCI'),
('arts_recreation', 'sports_recreation', 3000, 'Esportes, teoria do treinamento, psicologia esportiva'),
('arts_recreation', 'games_gamification', 2000, 'Game design, gamificação, teoria dos jogos digitais');

-- ─── UDC Class 8: Language & Literature ──────────────────────────────────────
-- Already covered under humanities

-- ─── UDC Class 9: Geography & History ────────────────────────────────────────
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('geography_history', NULL, 20000, 'Geografia, história, arqueologia, estudos regionais'),
('geography_history', 'world_history', 7000, 'História mundial, civilizações, guerras, revoluções'),
('geography_history', 'geography', 5000, 'Geografia física e humana, cartografia, SIG'),
('geography_history', 'archaeology', 4000, 'Arqueologia, paleontologia, patrimônio cultural'),
('geography_history', 'contemporary_history', 4000, 'História contemporânea, geopolítica atual, estudos de área');

-- ─── Expand existing domains with more subdomains ────────────────────────────

-- Business: add missing subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('business', 'strategy_management', 3000, 'Estratégia empresarial, gestão, liderança, organizações'),
('business', 'finance_investment', 3500, 'Finanças corporativas, investimentos, mercado de capitais'),
('business', 'marketing_sales', 2500, 'Marketing, vendas, comportamento do consumidor, CRM'),
('business', 'entrepreneurship', 2000, 'Empreendedorismo, startups, inovação, venture capital'),
('business', 'operations_logistics', 2000, 'Operações, logística, cadeia de suprimentos, lean');

-- Machine Learning: add missing subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('machine_learning', 'generative_ai', 8000, 'IA generativa, LLMs, difusão, multimodal, RLHF'),
('machine_learning', 'ai_agents', 4000, 'Agentes de IA, sistemas multi-agente, planejamento, autonomia'),
('machine_learning', 'ml_ops', 3000, 'MLOps, deploy de modelos, monitoramento, drift detection'),
('machine_learning', 'explainable_ai', 3000, 'XAI, interpretabilidade, SHAP, LIME, fairness');

-- Software Engineering: add missing subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('software_engineering', 'system_design', 4000, 'Design de sistemas, arquitetura de software, padrões'),
('software_engineering', 'frontend', 3000, 'Desenvolvimento frontend, React, TypeScript, UX engineering'),
('software_engineering', 'cloud_infrastructure', 4000, 'Cloud computing, GCP, AWS, serverless, containers'),
('software_engineering', 'api_design', 2500, 'Design de APIs, REST, GraphQL, tRPC, gRPC');

-- Mathematics: add missing subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('mathematics', 'discrete_math', 4000, 'Matemática discreta, grafos, combinatória, teoria dos números'),
('mathematics', 'optimization', 5000, 'Otimização matemática, programação linear, convexa, estocástica'),
('mathematics', 'information_theory', 3000, 'Teoria da informação, entropia, compressão, codificação');

-- Cognitive Science: add missing subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('cognitive_science', 'cognitive_psychology', 3000, 'Psicologia cognitiva, percepção, atenção, linguagem'),
('cognitive_science', 'behavioral_science', 2500, 'Ciências comportamentais, nudge, economia comportamental'),
('cognitive_science', 'human_computer_interaction', 3000, 'HCI, usabilidade, acessibilidade, interfaces adaptativas');

-- Health & Fitness: add subdomains
INSERT IGNORE INTO knowledge_wisdom (domain, subdomain, soa_estimate, description) VALUES
('health_fitness', 'medicine_clinical', 5000, 'Medicina clínica, diagnóstico, tratamento, farmacologia'),
('health_fitness', 'nutrition', 3000, 'Nutrição, dietética, suplementação, metabolismo'),
('health_fitness', 'exercise_science', 3000, 'Ciência do exercício, fisiologia, treinamento de força'),
('health_fitness', 'mental_health', 3000, 'Saúde mental, psicoterapia, neuropsiquiatria, bem-estar'),
('health_fitness', 'public_health', 2000, 'Saúde pública, epidemiologia, bioestatística, políticas');
