/**
 * Electron IPC channel names shared by the main process, preload and renderer.
 *
 * Keep channel strings in one place.  The values are intentionally stable because
 * they are part of the persisted desktop application's internal contract.
 */
export const IPC_CHANNELS = {
  day: {
    generate: 'day:generate',
    list: 'day:list',
    get: 'day:get',
    update: 'day:update',
    delete: 'day:delete',
  },
  fragment: {
    record: 'fragment:record',
    list: 'fragment:list',
    get: 'fragment:get',
    update: 'fragment:update',
    delete: 'fragment:delete',
    integrate: 'fragment:integrate',
  },
  crush: {
    create: 'crush:create',
    list: 'crush:list',
    get: 'crush:get',
    update: 'crush:update',
    delete: 'crush:delete',
  },
  relationship: {
    progress: 'relationship:progress',
    detectSignals: 'relationship:detectSignals',
    advancePhase: 'relationship:advancePhase',
    setPhase: 'relationship:setPhase',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
  },
  app: {
    info: 'app:info',
    checkUpdate: 'app:checkUpdate',
    quit: 'app:quit',
  },
  projectPortability: {
    export: 'projectPortability:export',
    inspectImport: 'projectPortability:inspectImport',
    commitImport: 'projectPortability:commitImport',
    cancelImport: 'projectPortability:cancelImport',
  },
  novelProject: {
    list: 'novelProject:list',
    current: 'novelProject:current',
    get: 'novelProject:get',
    create: 'novelProject:create',
    select: 'novelProject:select',
    update: 'novelProject:update',
    delete: 'novelProject:delete',
    configGet: 'novelProject:config:get',
    configUpdate: 'novelProject:config:update',
    volumeCreate: 'novelProject:volume:create',
    volumeList: 'novelProject:volume:list',
    volumeGet: 'novelProject:volume:get',
    volumeUpdate: 'novelProject:volume:update',
    volumeDelete: 'novelProject:volume:delete',
    volumeOutlineCreate: 'novelProject:volumeOutline:create',
    volumeOutlineList: 'novelProject:volumeOutline:list',
    volumeOutlineGet: 'novelProject:volumeOutline:get',
    volumeOutlineGetByVolume: 'novelProject:volumeOutline:getByVolume',
    volumeOutlineUpdate: 'novelProject:volumeOutline:update',
    volumeOutlineDelete: 'novelProject:volumeOutline:delete',
    volumeOutlineConfirm: 'novelProject:volumeOutline:confirm',
    volumeOutlineLock: 'novelProject:volumeOutline:lock',
    volumeOutlineUnlock: 'novelProject:volumeOutline:unlock',
    chapterOutlineCreate: 'novelProject:chapterOutline:create',
    chapterOutlineList: 'novelProject:chapterOutline:list',
    chapterOutlineListByVolume: 'novelProject:chapterOutline:listByVolume',
    chapterOutlineGet: 'novelProject:chapterOutline:get',
    chapterOutlineUpdate: 'novelProject:chapterOutline:update',
    chapterOutlineDelete: 'novelProject:chapterOutline:delete',
    chapterOutlineConfirm: 'novelProject:chapterOutline:confirm',
    chapterOutlineLock: 'novelProject:chapterOutline:lock',
    chapterOutlineUnlock: 'novelProject:chapterOutline:unlock',
    outlineContext: 'novelProject:outline:context',
    outlineSelectSourceMaterials: 'novelProject:outline:selectSourceMaterials',
    characterCreate: 'novelProject:character:create',
    characterList: 'novelProject:character:list',
    characterGet: 'novelProject:character:get',
    characterUpdate: 'novelProject:character:update',
    characterDelete: 'novelProject:character:delete',
    characterMapCrush: 'novelProject:character:mapCrush',
    worldviewCreate: 'novelProject:worldview:create',
    worldviewList: 'novelProject:worldview:list',
    worldviewGet: 'novelProject:worldview:get',
    worldviewUpdate: 'novelProject:worldview:update',
    worldviewDelete: 'novelProject:worldview:delete',
    organizationCreate: 'novelProject:organization:create',
    organizationList: 'novelProject:organization:list',
    organizationGet: 'novelProject:organization:get',
    organizationUpdate: 'novelProject:organization:update',
    organizationDelete: 'novelProject:organization:delete',
    relationCreate: 'novelProject:relation:create',
    relationList: 'novelProject:relation:list',
    relationGet: 'novelProject:relation:get',
    relationUpdate: 'novelProject:relation:update',
    relationDelete: 'novelProject:relation:delete',
    sourceMaterialCreate: 'novelProject:sourceMaterial:create',
    sourceMaterialList: 'novelProject:sourceMaterial:list',
    sourceMaterialGet: 'novelProject:sourceMaterial:get',
    sourceMaterialUpdate: 'novelProject:sourceMaterial:update',
    sourceMaterialDelete: 'novelProject:sourceMaterial:delete',
    sourceMaterialFromFragment: 'novelProject:sourceMaterial:fromFragment',
    sourceMaterialSelectForPrompt: 'novelProject:sourceMaterial:selectForPrompt',
    legacyCrushesList: 'novelProject:legacyCrushes:list',
    legacyFragmentsList: 'novelProject:legacyFragments:list',
  },
} as const

export type IpcChannel =
  | (typeof IPC_CHANNELS.day)[keyof typeof IPC_CHANNELS.day]
  | (typeof IPC_CHANNELS.fragment)[keyof typeof IPC_CHANNELS.fragment]
  | (typeof IPC_CHANNELS.crush)[keyof typeof IPC_CHANNELS.crush]
  | (typeof IPC_CHANNELS.relationship)[keyof typeof IPC_CHANNELS.relationship]
  | (typeof IPC_CHANNELS.settings)[keyof typeof IPC_CHANNELS.settings]
  | (typeof IPC_CHANNELS.app)[keyof typeof IPC_CHANNELS.app]
  | (typeof IPC_CHANNELS.projectPortability)[keyof typeof IPC_CHANNELS.projectPortability]
  | (typeof IPC_CHANNELS.novelProject)[keyof typeof IPC_CHANNELS.novelProject]
