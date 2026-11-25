export const ERAS = {
  orbit: ['近地时代', 'Orbital age'],
  expansion: ['恒星际时代', 'Interstellar age'],
  network: ['星域时代', 'Network age'],
  frontier: ['深空时代', 'Deep-space age'],
  adaptation: ['行星适应', 'Planetary adaptation'],
};

const TRACKS = [
  ['drive', ['航天推进', 'Propulsion'], [
    ['轨道动力学', 'Orbital mechanics'], ['脉冲裂变推进', 'Pulsed fission drives'], ['离子迁移级', 'Ion transfer stages'], ['磁喷管设计', 'Magnetic nozzles'],
    ['聚变推进舱', 'Fusion drive chambers'], ['激光阵列光帆', 'Phased laser sails'], ['磁帆制动', 'Magnetic sail braking'], ['多级聚变尾流', 'Staged fusion exhaust'],
    ['反物质催化点火', 'Antimatter-catalyzed ignition'], ['相对论巡航', 'Relativistic cruise'],
  ]],
  ['power', ['能源工程', 'Power systems'], [
    ['轨道光伏阵列', 'Orbital photovoltaics'], ['高温裂变堆', 'High-temperature fission'], ['超导电网', 'Superconducting grids'], ['闭式燃料循环', 'Closed fuel cycles'],
    ['磁约束聚变', 'Magnetic confinement fusion'], ['行波反应堆', 'Traveling-wave reactors'], ['轨道能束中继', 'Orbital power beaming'], ['日冕集能器', 'Coronal collectors'],
    ['紧凑聚变电网', 'Compact fusion grids'], ['星周集能群', 'Circumstellar collector swarms'],
  ]],
  ['habitat', ['生境与生命保障', 'Habitats and life support'], [
    ['闭环水气', 'Closed-loop air and water'], ['模块化加压舱', 'Modular pressure habitats'], ['轨道育种', 'Orbital seed banks'], ['生态闭合试验', 'Closed ecology trials'],
    ['离心重力栖地', 'Spin gravity settlements'], ['辐射屏蔽材料', 'Radiation shielding'], ['适应性生态群', 'Adaptive ecologies'], ['行星温控工程', 'Planetary thermal regulation'],
    ['全球水气调度', 'Global volatile management'], ['自主生物圈', 'Self-regulating biospheres'],
  ]],
  ['industry', ['资源与制造', 'Resources and manufacturing'], [
    ['在地取材', 'In-situ resource use'], ['真空冶金', 'Vacuum metallurgy'], ['岩层遥测', 'Crust tomography'], ['无人工厂', 'Autonomous factories'],
    ['轨道精炼港', 'Orbital refineries'], ['巨型结构打印', 'Large-assembly printing'], ['小行星回收', 'Asteroid recovery'], ['分子级分离', 'Molecular separations'],
    ['大宗物质牵引', 'Bulk material handling'], ['行星再制造', 'Planetary remanufacturing'],
  ]],
  ['network', ['通信与协作', 'Communications and coordination'], [
    ['深空定向天线', 'Deep-space antennas'], ['延迟容忍路由', 'Delay-tolerant routing'], ['原子时钟组网', 'Atomic clock synchronization'], ['自治航运协定', 'Autonomous shipping protocols'],
    ['长基线干涉测量', 'Long-baseline interferometry'], ['联邦库存账本', 'Federated inventories'], ['中继星座', 'Relay constellations'], ['自治代理谈判', 'Delegated negotiations'],
    ['引力透镜链路', 'Gravitational-lens links'], ['星际治理协议', 'Interstellar governance protocols'],
  ]],
  ['defense', ['防务与航行安全', 'Defense and navigation safety'], [
    ['尘粒探测', 'Dust particle detection'], ['护航指挥', 'Escort command'], ['高能质子防护', 'High-energy proton shielding'], ['碎片偏转场', 'Debris deflection fields'],
    ['近轨拦截系统', 'Near-orbit interception'], ['分布式预警', 'Distributed early warning'], ['快速反应舰队', 'Rapid-response fleets'], ['深空防线', 'Deep-space defense networks'],
    ['远征后勤', 'Expedition logistics'], ['纵深防御', 'Strategic defense in depth'],
  ]],
];

const PATHS = [
  ['biosphere', 'terran', ['温带生态', 'Temperate ecology'], [
    ['土壤微生境', 'Soil microbiomes'], ['陆地营养循环', 'Terrestrial nutrient cycles'], ['节水林带', 'Water-retaining forests'], ['温带产业带', 'Temperate industrial belts'], ['大陆生态连廊', 'Continental habitat corridors'],
  ]],
  ['oceanic', 'ocean', ['深海工程', 'Ocean engineering'], [
    ['浮式栖地', 'Floating habitats'], ['潮汐发电', 'Tidal generation'], ['深水采矿', 'Deepwater mineral recovery'], ['水面物流网', 'Surface logistics networks'], ['深海生物制造', 'Abyssal biomanufacturing'],
  ]],
  ['cryo', 'ice', ['低温工程', 'Cryogenic engineering'], [
    ['冰下封闭舱', 'Subglacial pressure cells'], ['冰盖隔热', 'Ice-sheet insulation'], ['间歇泉取能', 'Cryovolcanic energy'], ['低温推进剂库', 'Cryogenic propellant banks'], ['冰幔贯通', 'Ice mantle transport'],
  ]],
  ['arid', 'desert', ['干旱生态', 'Arid ecology'], [
    ['空气捕水', 'Atmospheric water harvesting'], ['地下蓄热', 'Subsurface heat storage'], ['岩孔生态仓', 'Pore-space habitats'], ['低湿冶金', 'Low-humidity metallurgy'], ['区域积水调配', 'Regional watershed management'],
  ]],
  ['geothermal', 'volcanic', ['地热产业', 'Geothermal industry'], [
    ['玄武岩封装', 'Basalt habitat casings'], ['熔岩热交换', 'Magma heat exchange'], ['岩浆冶金', 'Magma-assisted refining'], ['地壳压力监测', 'Crust pressure monitoring'], ['板块热网', 'Plate-scale thermal grids'],
  ]],
  ['shield', 'irradiated', ['辐射环境', 'High-radiation settlements'], [
    ['埋地屏蔽舱', 'Buried shielded habitats'], ['分层磁屏蔽', 'Layered magnetic shielding'], ['耐辐射材料', 'Radiation-resistant materials'], ['高通量粒子站', 'High-flux particle stations'], ['辐射带航运', 'Radiation-belt transport'],
  ]],
];

export const TRACK_LABELS = Object.fromEntries([...TRACKS.map(([id, name]) => [id, name]), ...PATHS.map(([id, , name]) => [id, name])]);

export const TECHS = [];
for (let level = 1; level <= 10; level++) {
  for (const [track, , names] of TRACKS) {
    const requires = level > 1 ? [`${track}-${level - 1}`] : [];
    if (level === 4) requires.push(`${track === 'power' ? 'industry' : 'power'}-2`);
    if (level === 7) requires.push(`${track === 'network' ? 'drive' : 'network'}-4`);
    if (level === 10) requires.push(`${track === 'habitat' ? 'industry' : 'habitat'}-6`);
    TECHS.push({ id: `${track}-${level}`, track, level, name: names[level - 1], requires, biome: null,
      era: level <= 2 ? 'orbit' : level <= 5 ? 'expansion' : level <= 8 ? 'network' : 'frontier',
      cost: Math.round(8 + 9 * level ** 1.61),
    });
  }
}
for (const [track, biome, , names] of PATHS) {
  for (let level = 1; level <= names.length; level++) {
    const requires = level > 1 ? [`${track}-${level - 1}`] : [];
    requires.push(`habitat-${level === 1 ? 1 : level + 1}`);
    TECHS.push({ id: `${track}-${level}`, track, level, name: names[level - 1], requires, biome, era: 'adaptation', cost: 14 + level * level * 8 });
  }
}

export const TECH_BY_ID = new Map(TECHS.map(tech => [tech.id, tech]));
export const BIOME_TRACK = Object.fromEntries(PATHS.map(([track, biome]) => [biome, track]));
export const STARTING_TECH = TRACKS.map(([id]) => `${id}-1`);

export function researchLevels(research) {
  const levels = {};
  for (const id of research.complete) {
    const tech = TECH_BY_ID.get(id);
    if (tech) levels[tech.track] = Math.max(levels[tech.track] || 0, tech.level);
  }
  return levels;
}

export function getResearchStatus(id, research, ownedBiomes) {
  const tech = TECH_BY_ID.get(id);
  if (!tech) return 'unknown';
  if (research.complete.includes(id)) return 'complete';
  if (research.active === id) return 'researching';
  if (!tech.requires.every(requirement => research.complete.includes(requirement))) return 'prerequisites';
  if (tech.biome && !ownedBiomes.has(tech.biome)) return 'environment';
  return 'available';
}
