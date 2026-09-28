def compute_indirect_clo_attainment(mean_rating: float, scale_max: int) -> float:
    """
    Converts a mean Likert-scale rating into a 0-100 percentage.
    Formula: (mean_rating / scale_max) * 100
    """
    if scale_max <= 0:
        raise ValueError("scale_max must be greater than 0")
    if mean_rating < 0 or mean_rating > scale_max:
        raise ValueError("mean_rating must be between 0 and scale_max")
    return round((mean_rating / scale_max) * 100, 2)

