;; Quota Compliance Contract
;; Ensures adherence to sustainable fishing limits

;; Define data maps
(define-map species-quotas
  { species: (string-ascii 100), year: uint }
  {
    total-quota: uint, ;; in kilograms
    remaining-quota: uint,
    last-updated: uint
  }
)

(define-map vessel-quotas
  { vessel-id: uint, species: (string-ascii 100), year: uint }
  {
    allocated-quota: uint,
    used-quota: uint,
    last-updated: uint
  }
)

;; Define public functions
(define-public (set-species-quota
                (species (string-ascii 100))
                (year uint)
                (total-quota uint))
  (begin
    ;; Only authorized regulators should be able to set quotas
    ;; For simplicity, we're not implementing the authorization check
    (map-set species-quotas
      { species: species, year: year }
      {
        total-quota: total-quota,
        remaining-quota: total-quota,
        last-updated: block-height
      }
    )
    (ok true)
  )
)

(define-public (allocate-vessel-quota
                (vessel-id uint)
                (species (string-ascii 100))
                (year uint)
                (quota uint))
  (let (
    (species-quota (unwrap! (map-get? species-quotas { species: species, year: year }) (err u1)))
    (remaining (get remaining-quota species-quota))
  )
    (if (<= quota remaining)
      (begin
        ;; Update species remaining quota
        (map-set species-quotas
          { species: species, year: year }
          (merge species-quota {
            remaining-quota: (- remaining quota),
            last-updated: block-height
          })
        )

        ;; Set vessel quota
        (map-set vessel-quotas
          { vessel-id: vessel-id, species: species, year: year }
          {
            allocated-quota: quota,
            used-quota: u0,
            last-updated: block-height
          }
        )
        (ok true)
      )
      (err u2) ;; Not enough quota remaining
    )
  )
)

(define-public (record-catch-against-quota
                (vessel-id uint)
                (species (string-ascii 100))
                (quantity uint))
  (let (
    (year (get-current-year))
    (vessel-quota (unwrap! (map-get? vessel-quotas
                           { vessel-id: vessel-id, species: species, year: year })
                  (err u1)))
    (used (get used-quota vessel-quota))
    (allocated (get allocated-quota vessel-quota))
  )
    (if (<= (+ used quantity) allocated)
      (begin
        (map-set vessel-quotas
          { vessel-id: vessel-id, species: species, year: year }
          (merge vessel-quota {
            used-quota: (+ used quantity),
            last-updated: block-height
          })
        )
        (ok true)
      )
      (err u3) ;; Exceeds allocated quota
    )
  )
)

;; Read-only functions
(define-read-only (get-species-quota (species (string-ascii 100)) (year uint))
  (map-get? species-quotas { species: species, year: year })
)

(define-read-only (get-vessel-quota (vessel-id uint) (species (string-ascii 100)) (year uint))
  (map-get? vessel-quotas { vessel-id: vessel-id, species: species, year: year })
)

(define-read-only (check-vessel-quota-compliance (vessel-id uint) (species (string-ascii 100)))
  (let (
    (year (get-current-year))
    (vessel-quota (default-to { allocated-quota: u0, used-quota: u0, last-updated: u0 }
                  (map-get? vessel-quotas { vessel-id: vessel-id, species: species, year: year })))
  )
    (<= (get used-quota vessel-quota) (get allocated-quota vessel-quota))
  )
)

;; Helper function to get current year (simplified)
(define-read-only (get-current-year)
  ;; In a real implementation, this would calculate the year from block height
  ;; For simplicity, we're returning a fixed value
  u2023
)

