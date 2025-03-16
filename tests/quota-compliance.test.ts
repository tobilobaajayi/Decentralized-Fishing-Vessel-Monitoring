import { describe, it, expect, beforeEach } from "vitest"

// Mock the Clarity VM environment
const mockClarity = {
  tx: {
    sender: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  },
  block: {
    height: 100,
  },
}

// Mock the contract functions
const quotaComplianceContract = {
  speciesQuotas: new Map(),
  vesselQuotas: new Map(),
  
  setSpeciesQuota(species, year, totalQuota) {
    const key = `${species}-${year}`
    
    this.speciesQuotas.set(key, {
      totalQuota,
      remainingQuota: totalQuota,
      lastUpdated: mockClarity.block.height,
    })
    
    return { value: true }
  },
  
  allocateVesselQuota(vesselId, species, year, quota) {
    const speciesKey = `${species}-${year}`
    const vesselKey = `${vesselId}-${species}-${year}`
    
    if (!this.speciesQuotas.has(speciesKey)) {
      return { error: 1 }
    }
    
    const speciesQuota = this.speciesQuotas.get(speciesKey)
    const remaining = speciesQuota.remainingQuota
    
    if (quota > remaining) {
      return { error: 2 }
    }
    
    // Update species remaining quota
    this.speciesQuotas.set(speciesKey, {
      ...speciesQuota,
      remainingQuota: remaining - quota,
      lastUpdated: mockClarity.block.height,
    })
    
    // Set vessel quota
    this.vesselQuotas.set(vesselKey, {
      allocatedQuota: quota,
      usedQuota: 0,
      lastUpdated: mockClarity.block.height,
    })
    
    return { value: true }
  },
  
  recordCatchAgainstQuota(vesselId, species, quantity) {
    const year = this.getCurrentYear()
    const vesselKey = `${vesselId}-${species}-${year}`
    
    if (!this.vesselQuotas.has(vesselKey)) {
      return { error: 1 }
    }
    
    const vesselQuota = this.vesselQuotas.get(vesselKey)
    const used = vesselQuota.usedQuota
    const allocated = vesselQuota.allocatedQuota
    
    if (used + quantity > allocated) {
      return { error: 3 }
    }
    
    this.vesselQuotas.set(vesselKey, {
      ...vesselQuota,
      usedQuota: used + quantity,
      lastUpdated: mockClarity.block.height,
    })
    
    return { value: true }
  },
  
  getSpeciesQuota(species, year) {
    const key = `${species}-${year}`
    return this.speciesQuotas.get(key) || null
  },
  
  getVesselQuota(vesselId, species, year) {
    const key = `${vesselId}-${species}-${year}`
    return this.vesselQuotas.get(key) || null
  },
  
  checkVesselQuotaCompliance(vesselId, species) {
    const year = this.getCurrentYear()
    const key = `${vesselId}-${species}-${year}`
    
    if (!this.vesselQuotas.has(key)) {
      return true // No quota allocated means no violation
    }
    
    const vesselQuota = this.vesselQuotas.get(key)
    return vesselQuota.usedQuota <= vesselQuota.allocatedQuota
  },
  
  getCurrentYear() {
    return 2023
  },
}

describe("Quota Compliance Contract", () => {
  beforeEach(() => {
    // Reset the contract state before each test
    quotaComplianceContract.speciesQuotas = new Map()
    quotaComplianceContract.vesselQuotas = new Map()
    mockClarity.block.height = 100
  })
  
  it("should set species quota", () => {
    const result = quotaComplianceContract.setSpeciesQuota(
        "Cod", // species
        2023, // year
        100000, // totalQuota (kg)
    )
    
    expect(result.value).toBe(true)
    
    const quota = quotaComplianceContract.getSpeciesQuota("Cod", 2023)
    expect(quota).not.toBeNull()
    expect(quota.totalQuota).toBe(100000)
    expect(quota.remainingQuota).toBe(100000)
    expect(quota.lastUpdated).toBe(100)
  })
  
  it("should allocate vessel quota", () => {
    // First set species quota
    quotaComplianceContract.setSpeciesQuota("Cod", 2023, 100000)
    
    // Allocate quota to vessel
    const result = quotaComplianceContract.allocateVesselQuota(
        1, // vesselId
        "Cod", // species
        2023, // year
        5000, // quota (kg)
    )
    
    expect(result.value).toBe(true)
    
    // Check vessel quota
    const vesselQuota = quotaComplianceContract.getVesselQuota(1, "Cod", 2023)
    expect(vesselQuota).not.toBeNull()
    expect(vesselQuota.allocatedQuota).toBe(5000)
    expect(vesselQuota.usedQuota).toBe(0)
    
    // Check remaining species quota
    const speciesQuota = quotaComplianceContract.getSpeciesQuota("Cod", 2023)
    expect(speciesQuota.remainingQuota).toBe(95000)
  })
  
  it("should not allocate more than available quota", () => {
    // Set species quota
    quotaComplianceContract.setSpeciesQuota("Cod", 2023, 100000)
    
    // Try to allocate more than available
    const result = quotaComplianceContract.allocateVesselQuota(
        1, // vesselId
        "Cod", // species
        2023, // year
        150000, // quota (kg) - more than available
    )
    
    expect(result.error).toBe(2)
  })
  
  it("should record catch against quota", () => {
    // Set species quota and allocate to vessel
    quotaComplianceContract.setSpeciesQuota("Cod", 2023, 100000)
    quotaComplianceContract.allocateVesselQuota(1, "Cod", 2023, 5000)
    
    // Record catch
    const result = quotaComplianceContract.recordCatchAgainstQuota(
        1, // vesselId
        "Cod", // species
        2000, // quantity (kg)
    )
    
    expect(result.value).toBe(true)
    
    // Check updated vessel quota
    const vesselQuota = quotaComplianceContract.getVesselQuota(1, "Cod", 2023)
    expect(vesselQuota.usedQuota).toBe(2000)
  })
  
  it("should not allow catch exceeding quota", () => {
    // Set species quota and allocate to vessel
    quotaComplianceContract.setSpeciesQuota("Cod", 2023, 100000)
    quotaComplianceContract.allocateVesselQuota(1, "Cod", 2023, 5000)
    
    // Record catch that exceeds quota
    const result = quotaComplianceContract.recordCatchAgainstQuota(
        1, // vesselId
        "Cod", // species
        6000, // quantity (kg) - more than allocated
    )
    
    expect(result.error).toBe(3)
  })
  
  it("should check vessel quota compliance", () => {
    // Set species quota and allocate to vessel
    quotaComplianceContract.setSpeciesQuota("Cod", 2023, 100000)
    quotaComplianceContract.allocateVesselQuota(1, "Cod", 2023, 5000)
    
    // Initially compliant
    let compliant = quotaComplianceContract.checkVesselQuotaCompliance(1, "Cod")
    expect(compliant).toBe(true)
    
    // Record catch within quota
    quotaComplianceContract.recordCatchAgainstQuota(1, "Cod", 4000)
    
    // Still compliant
    compliant = quotaComplianceContract.checkVesselQuotaCompliance(1, "Cod")
    expect(compliant).toBe(true)
    
    // Record catch that reaches quota limit
    quotaComplianceContract.recordCatchAgainstQuota(1, "Cod", 1000)
    
    // At limit, still compliant
    compliant = quotaComplianceContract.checkVesselQuotaCompliance(1, "Cod")
    expect(compliant).toBe(true)
  })
})

